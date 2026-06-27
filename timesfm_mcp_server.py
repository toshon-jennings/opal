#!/usr/bin/env python3
import sys
import os

from mcp.server.fastmcp import FastMCP
import numpy as np

mcp = FastMCP("TimesFM")

# Global variables for lazy loading
_model = None
_model_checkpoint = None

def get_model(checkpoint: str):
    global _model, _model_checkpoint
    
    # If the model is already loaded and is the same checkpoint, reuse it
    if _model is not None and _model_checkpoint == checkpoint:
        return _model
        
    print(f"Loading TimesFM model from checkpoint: {checkpoint}...", file=sys.stderr)
    
    try:
        import torch
        import timesfm
    except ImportError as e:
        raise RuntimeError(
            "Required packages (torch, timesfm) are not installed. "
            "Please run the setup_timesfm.sh script to install them."
        ) from e

    # Configure float32 matmul precision for performance
    torch.set_float32_matmul_precision("high")
    
    try:
        if hasattr(timesfm, "TimesFM_2p5_200M_torch") and "2.5" in checkpoint:
            # Load TimesFM 2.5
            model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(checkpoint)
            model.compile(timesfm.ForecastConfig(
                max_context=1024,
                max_horizon=256,
                normalize_inputs=True,
                use_continuous_quantile_head=True,
                force_flip_invariance=True,
                infer_is_positive=True,
                fix_quantile_crossing=True,
            ))
        else:
            # Fallback to TimesFM 1.x
            backend = "cpu"
            if torch.backends.mps.is_available():
                backend = "cpu"  # CPU is safest and most stable fallback on Apple Silicon for 1.x
            
            model = timesfm.TimesFm(
                context_len=512,
                horizon_len=128,
                input_patch_len=32,
                output_patch_len=128,
                num_layers=20,
                model_dims=1280,
                backend=backend,
            )
            model.load_from_checkpoint(repo_id=checkpoint)
            
        _model = model
        _model_checkpoint = checkpoint
        print("Model loaded successfully.", file=sys.stderr)
        return _model
    except Exception as e:
        raise RuntimeError(f"Failed to load model checkpoint '{checkpoint}': {str(e)}")

@mcp.tool()
def forecast_univariate(
    history: list[float],
    horizon: int = 24,
    checkpoint: str = "google/timesfm-2.5-200m-pytorch"
) -> dict:
    """
    Generate zero-shot time-series forecasts using Google's TimesFM model.
    
    Args:
        history: Chronological list of float/int data points (historical time-series values).
        horizon: Number of future time steps to forecast.
        checkpoint: The Hugging Face checkpoint to load (default: "google/timesfm-2.5-200m-pytorch").
    
    Returns:
        A dictionary with the point forecasts, quantiles, and forecasting metadata.
    """
    if not history:
        return {"error": "History data cannot be empty."}
    if horizon <= 0:
        return {"error": "Horizon must be a positive integer."}
        
    try:
        model = get_model(checkpoint)
        
        # Prepare inputs as a list of 1-D numpy arrays
        inputs = [np.array(history, dtype=np.float32)]
        
        import timesfm
        
        if hasattr(timesfm, "TimesFM_2p5_200M_torch") and "2.5" in checkpoint:
            point_forecast, quantile_forecast = model.forecast(
                horizon=horizon,
                inputs=inputs
            )
            # Extracted outputs are numpy arrays: point_forecast shape is (1, horizon)
            points = point_forecast[0].tolist()
            quantiles = quantile_forecast[0].tolist() if quantile_forecast is not None else None
            
            return {
                "status": "success",
                "checkpoint": checkpoint,
                "point_forecast": points,
                "quantiles": quantiles,
                "quantiles_legend": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]
            }
        else:
            # TimesFM 1.x fallback
            point_forecast, quantile_forecast = model.forecast(
                inputs,
                freq=[0]
            )
            points = point_forecast[0][:horizon].tolist()
            quantiles = quantile_forecast[0][:horizon].tolist() if quantile_forecast is not None else None
            
            return {
                "status": "success",
                "checkpoint": checkpoint,
                "point_forecast": points,
                "quantiles": quantiles
            }
            
    except Exception as e:
        import traceback
        error_msg = f"Error during forecasting: {str(e)}\n{traceback.format_exc()}"
        print(error_msg, file=sys.stderr)
        return {"status": "error", "message": str(e)}

@mcp.tool()
def plot_forecast(
    history: list[float],
    forecast_values: list[float],
    title: str = "TimesFM Time-Series Forecast"
) -> str:
    """
    Generate a visual plot (base64 image) of the historical data and forecasted values.
    
    Args:
        history: Chronological list of historical time-series data points.
        forecast_values: Forecasted values returned by forecast_univariate.
        title: Title of the generated chart.
        
    Returns:
        A string containing a Markdown image element representing the base64-encoded chart.
    """
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import io
        import base64
        
        plt.figure(figsize=(10, 5))
        
        # Plot history
        history_x = list(range(len(history)))
        plt.plot(history_x, history, label="Historical Data", color="#39C0C8", linewidth=2)
        
        # Plot forecast starting from the last history point to show continuity
        forecast_x = list(range(len(history) - 1, len(history) + len(forecast_values)))
        forecast_extended = [history[-1]] + forecast_values
        
        plt.plot(forecast_x, forecast_extended, label="TimesFM Forecast", color="#C5692D", linestyle="--", linewidth=2)
        plt.axvline(x=len(history) - 1, color="#888888", linestyle=":", label="Forecast Horizon Boundary")
        
        plt.title(title, fontsize=14, color="#1e1e1e")
        plt.xlabel("Time Steps", fontsize=11)
        plt.ylabel("Value", fontsize=11)
        plt.legend(frameon=True, facecolor="#f5f5f5")
        plt.grid(True, linestyle=":", alpha=0.6)
        
        plt.tight_layout()
        
        # Save to buffer
        buf = io.BytesIO()
        plt.savefig(buf, format="png", dpi=150)
        buf.seek(0)
        img_base64 = base64.b64encode(buf.read()).decode("utf-8")
        plt.close()
        
        return f"![{title}](data:image/png;base64,{img_base64})"
        
    except ImportError:
        return "Matplotlib is not installed. Returning text-based visualization.\n" + \
               f"History: {history[-10:]} (last 10 points)\nForecast: {forecast_values}"
    except Exception as e:
        return f"Failed to generate plot: {str(e)}"

if __name__ == "__main__":
    import sys
    import json
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        try:
            if cmd == "forecast":
                history = json.loads(sys.argv[2])
                horizon = int(sys.argv[3]) if len(sys.argv) > 3 else 24
                checkpoint = sys.argv[4] if len(sys.argv) > 4 else "google/timesfm-2.5-200m-pytorch"
                result = forecast_univariate(history=history, horizon=horizon, checkpoint=checkpoint)
                print(json.dumps(result))
            elif cmd == "plot":
                history = json.loads(sys.argv[2])
                forecast_values = json.loads(sys.argv[3])
                title = sys.argv[4] if len(sys.argv) > 4 else "TimesFM Time-Series Forecast"
                result = plot_forecast(history=history, forecast_values=forecast_values, title=title)
                print(result)
            else:
                print(json.dumps({"status": "error", "message": f"Unknown CLI command: {cmd}"}))
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(0)
    else:
        mcp.run()
