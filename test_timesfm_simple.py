#!/usr/bin/env python3
import sys
import os

# Add project root to path to import our server module
sys.path.append("/Users/toshonjennings/opal")
from timesfm_mcp_server import forecast_univariate

print("=== TimesFM Integration Test ===")
# Mock history data: a simple linear trend
history = [10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 22.0, 24.0, 26.0, 28.0]
horizon = 5

print(f"Input History: {history}")
print(f"Requesting forecast horizon: {horizon}")
print("\nLoading weights (first run will download the ~800MB checkpoint from HuggingFace)...")

try:
    result = forecast_univariate(
        history=history, 
        horizon=horizon, 
        checkpoint="google/timesfm-2.5-200m-pytorch"
    )

    if result.get("status") == "success":
        print("\n🎉 SUCCESS: TimesFM loaded and ran successfully!")
        print(f"Forecasted next {horizon} steps: {result['point_forecast']}")
    else:
        print(f"\n❌ FAILURE: Model returned an error: {result.get('message')}")
except Exception as e:
    print(f"\n❌ ERROR: Failed to run test script: {str(e)}")
