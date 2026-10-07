# Third-party components

Be Better uses the packages recorded in `package-lock.json`; their upstream licenses remain with the installed packages. No source from Endurain, FitTrackee, GoldenCheetah, OptMem, or Garmin's official FIT SDK is included.

Coaching concepts were informed by [ai-running-coach](https://github.com/mmornati/ai-running-coach) and [claude-coach](https://github.com/felixrieseberg/claude-coach). The application prompts and write handlers are independently implemented.

Training-pattern descriptions in `packages/domain/src/programs.ts` are original. They cite the structure of public plans from the Boston Athletic Association, Hal Higdon, iRunFar, REI, British Cycling, and the Tour du Mont Blanc cycling framework. Those publishers' weekly workouts are not included. The example sessions in `packages/domain/src/workouts.ts` are original compositions for this app. The B.A.A. page says its training-plan material may not be reproduced without consent. The source notes are in `docs/research/program-library.md`.

## FIT import and export license review

Reviewed on 2026-10-06 before adding workout export. The installed `fit-file-parser` package **6.1.2** is the npm distribution of [jimmykane/fit-parser](https://github.com/jimmykane/fit-parser). Its installed `LICENSE` and the [upstream license](https://github.com/jimmykane/fit-parser/blob/main/LICENSE) identify the MIT License, copyright 2015 Pierre Jacquier. The package includes `FitEncoder`, which Be Better uses to create workout files; exported files were decoded again using the strict FIT parser to check their structure.

Be Better does not use `@garmin/fitsdk`. FIT numeric target units differ across devices, so this implementation writes open targets with readable effort cues rather than claiming native numeric target compatibility. A real watch import remains a separate hardware check.

```text
The MIT License (MIT)

Copyright (c) 2015 Pierre Jacquier
http://pierrejacquier.com | @pierremtb

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Other selected components

- `fast-xml-parser`: MIT; GPX and TCX decoding.
- `assistant-ui`: MIT; conversation components.
- Vercel AI SDK: Apache-2.0; messages, tools, and streaming adapters.
- `@openai/codex` **0.160.1**: Apache-2.0; pinned official local app-server runtime. See the installed package notices for runtime dependencies.

This file records the component choices and the required FIT export review. It is not a replacement for upstream license files.
