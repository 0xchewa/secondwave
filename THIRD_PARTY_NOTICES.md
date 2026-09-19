# Third-party provenance

## Model runtime and frozen imported weights

The Early Signal feature schema, GBDT runtime and explanations derive from
https://github.com/kingwilliamAI/Augur at commit
`384232d598789124427b7ad4fbfb9614a3a69ec8`. The upstream MIT notice is retained.
The shipped Early artifact uses the frozen logistic model; peak-range inference
uses the frozen squared-loss model. Second Wave scenario rules, causal history,
coverage checks and this console are Second Wave components.

Source files: `src/engines/early/vendor/`, `models/early.json`, `models/peak.json`.

Copyright (c) 2026 Augur contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## Runtime dependencies

viem: MIT. tsx: MIT. TypeScript: Apache-2.0. Dependency packages include their licenses.
No code or artwork was copied from the YOINK visual reference.
