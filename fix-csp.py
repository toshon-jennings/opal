import re

with open('src/lib/previewSecurity.js', 'r') as f:
    content = f.read()

content = content.replace("'unsafe-inline' 'unsafe-eval'", "'unsafe-inline'")

with open('src/lib/previewSecurity.js', 'w') as f:
    f.write(content)
