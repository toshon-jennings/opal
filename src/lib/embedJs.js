// Serialize a value for splicing into a JS source string — the scripts we hand
// to `webview.executeJavaScript`. JSON is valid JS source except for these two
// separators, which are legal inside a JSON string but historically illegal in
// a JS string literal.
export function embed(value) {
    return JSON.stringify(value)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}
