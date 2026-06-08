import React from 'react';
import './PerciMascot.css';

/**
 * Animated Sir Perci mascot.
 *
 * Inline SVG whose parts (antennae, eyes, sword, shield) are grouped with
 * classes so CSS keyframes can animate them per `state`. Drop it anywhere in
 * the UI to communicate what Perci is doing.
 *
 * @param {object}  props
 * @param {('idle'|'thinking'|'working'|'happy'|'error')} [props.state='idle']
 * @param {number}  [props.size=28]      rendered width in px (height scales)
 * @param {string}  [props.className]
 * @param {string}  [props.title]        accessible label
 */
export default function PerciMascot({ state = 'idle', size = 28, className = '', title, ...rest }) {
    const height = Math.round((size * 300) / 340);
    return (
        <svg
            className={`perci ${className}`}
            data-state={state}
            width={size}
            height={height}
            viewBox="0 0 340 300"
            role="img"
            aria-label={title || `Perci ${state}`}
            xmlns="http://www.w3.org/2000/svg"
            {...rest}
        >
            <g className="perci-all">
                {/* antennae (animated) */}
                <g className="perci-antennae" fill="#C5692D" stroke="#C5692D" strokeLinecap="round">
                    <line x1="150" y1="107" x2="126" y2="76" strokeWidth="13" />
                    <circle cx="124" cy="72" r="16" />
                    <line x1="190" y1="107" x2="214" y2="76" strokeWidth="13" />
                    <circle cx="216" cy="72" r="16" />
                </g>

                {/* feet (static) */}
                <g fill="#C5692D" stroke="#C5692D" strokeLinecap="round">
                    <line x1="150" y1="228" x2="134" y2="252" strokeWidth="13" />
                    <circle cx="132" cy="256" r="15" />
                    <line x1="190" y1="228" x2="206" y2="252" strokeWidth="13" />
                    <circle cx="208" cy="256" r="15" />
                </g>

                {/* body */}
                <path
                    d="M170 90 C208 90 243 119 247 160 C250 191 238 221 208 231 C192 236 148 236 132 231 C102 221 90 191 93 160 C97 119 132 90 170 90 Z"
                    fill="#C5692D"
                />

                {/* arms */}
                <g fill="#C5692D" stroke="#C5692D" strokeLinecap="round">
                    <line x1="206" y1="176" x2="247" y2="204" strokeWidth="14" />
                    <line x1="134" y1="178" x2="92" y2="203" strokeWidth="14" />
                </g>

                {/* face */}
                <g className="perci-eyes">
                    <g className="perci-eyes-inner" fill="#7A3C16">
                        <circle cx="151" cy="136" r="8" />
                        <circle cx="189" cy="136" r="8" />
                    </g>
                </g>
                <path
                    d="M154 158 Q170 168 186 158"
                    fill="none"
                    stroke="#7A3C16"
                    strokeWidth="6"
                    strokeLinecap="round"
                />

                {/* shield = gold { brace */}
                <g className="perci-shield">
                    <path
                        d="M92 164 C80 164 80 176 80 188 C80 197 78 202 68 207 C78 212 80 217 80 226 C80 238 80 250 92 250"
                        fill="none"
                        stroke="#CD9A3C"
                        strokeWidth="11"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <circle cx="92" cy="206" r="12" fill="#C5692D" />
                </g>

                {/* sword */}
                <g className="perci-sword">
                    <g transform="rotate(10 248 204)">
                        <path
                            d="M241 190 L255 190 L249 86 C248.5 82 247.5 82 247 86 L241 190 Z"
                            fill="#E7E3DB"
                            stroke="#B9B2A6"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                        />
                        <line x1="248" y1="186" x2="248" y2="98" stroke="#F5F2EC" strokeWidth="2" strokeLinecap="round" />
                        <rect x="244" y="190" width="8" height="38" rx="4" fill="#7A3C16" />
                        <circle cx="248" cy="230" r="8" fill="#CD9A3C" />
                        <path
                            d="M224 192 C224 187 227 186 232 186 C238 186 242 185 244 182 C245.5 180 250.5 180 252 182 C254 185 258 186 264 186 C269 186 272 187 272 192"
                            fill="none"
                            stroke="#CD9A3C"
                            strokeWidth="8"
                            strokeLinecap="round"
                        />
                        <circle cx="248" cy="204" r="11" fill="#C5692D" />
                    </g>
                </g>
            </g>
        </svg>
    );
}
