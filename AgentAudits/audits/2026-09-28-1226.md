# Machine audit 2026-09-28 12:26:50
**Verdict: CRIT** — swap 16.8GB, free 68MB, load 3.14

| Metric | Value |
|---|---|
| Load (1m) / cores | 3.14 / 10 |
| RAM free / wired / compressor | 68 MB / 5.1 GB / 4.9 GB of 16 GB |
| Swap used | 16.8 / 18.0 GB |
| kern.memorystatus_level | 34 (lower = more pressure) |
| Uptime | 35 days, 21:36 |
| Disk (Data) | 85% used, 62Gi free |
| Processes / threads | 1035 / 8516 |
| Codex app | 58 procs, 1872 MB RSS, up 34:47 |
| Codex renderer | pid 50357 mem 3215M compressed 2841M |
| Stale codex TUIs / claude / grok | 28 / 13 / 10 |
| node / npm / MCP servers | 136 / 75 / 38 |
| Docker | VM limit 12288 MiB, running containers: 0 |
| ~/.codex size / sessions >100MB | 27G / 7 |

## Top 12 by real footprint (mem, compressed)
```
PID    MEM   CMPRS COMMAND         
50357  3216M 2982M Codex (Renderer)
91884  1619M 1515M node            
58206  692M  458M  Claude Helper (R
39229  662M  653M  Electron Helper 
407    618M  220M  WindowServer    
16301  534M  416M  Discord Helper (
79379  500M  298M  2.1.258         
56442  480M  281M  2.1.258         
1568   480M  393M  2.1.241         
50350  478M  461M  codex           
58488  467M  271M  2.1.259         
50279  425M  372M  ChatGPT         
```

## Top 8 by CPU (2s sample)
```
PID    %CPU MEM    COMMAND         
0      69.6 68M-   kernel_task     
407    62.2 618M-  WindowServer    
58185  14.1 188M-  Claude Helper   
50357  13.4 3220M+ Codex (Renderer)
701    10.8 378M   Messages        
50316  10.3 313M-  Codex (Service) 
58206  8.0  691M+  Claude Helper (R
50908  5.9  358M+  2.1.261         
```

## Agent sessions older than 1 day
```
1460 ttys001 35-21:35:02 16MB grok --permission-mode bypassPermissions --resume 01a0206b-7ad2-7483-aa1b-56fddd
1548 ttys003 35-21:35:02 21MB grok --permission-mode bypassPermissions --resume 01a02051-7eb3-7301-91d7-4f04c3
1566 ttys004 35-21:35:02 23MB grok --permission-mode bypassPermissions --resume 01a03014-cfbf-7ac0-92a9-6579bd
1568 ttys005 35-21:35:02 93MB claude --dangerously-skip-permissions --resume fe17e803-6bf9-4bb7-b604-384d4466f
63361 ttys009 35-16:40:33 0MB node /opt/homebrew/bin/codex --yolo
63362 ttys009 35-16:40:33 11MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
50870 ttys012 35-16:50:06 20MB grok --yolo
50908 ttys013 06-00:47:53 209MB claude
64417 ttys017 35-16:40:03 0MB node /opt/homebrew/bin/codex --yolo
64418 ttys017 35-16:40:03 12MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
13306 ttys018 26-01:19:57 0MB node /opt/homebrew/bin/codex --yolo
13307 ttys018 26-01:19:57 12MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
40119 ttys019 35-15:39:15 0MB node /opt/homebrew/bin/codex --yolo
40120 ttys019 35-15:39:15 11MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
40593 ttys021 35-15:39:08 21MB grok --yolo
41259 ttys022 35-15:38:53 0MB node /opt/homebrew/bin/codex --yolo
41260 ttys022 35-15:38:53 14MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
28780 ttys023 35-13:21:51 64MB claude --dangerously-skip-permissions
41607 ttys024 35-15:38:47 18MB grok --yolo
48606 ttys031 35-14:19:28 0MB node /opt/homebrew/bin/codex --yolo
48607 ttys031 35-14:19:28 13MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
48824 ttys032 35-14:19:23 13MB claude --dangerously-skip-permissions
48636 ttys033 35-14:19:26 0MB node /opt/homebrew/bin/codex --yolo
48637 ttys033 35-14:19:26 12MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
49042 ttys034 35-14:19:21 18MB grok --yolo
51633 ttys036 35-14:18:02 0MB node /opt/homebrew/bin/codex --yolo
51634 ttys036 35-14:18:02 11MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
51830 ttys037 35-14:17:59 65MB claude --dangerously-skip-permissions
51887 ttys038 35-14:17:57 19MB grok --yolo
54374 ttys039 23-20:16:38 1MB node /opt/homebrew/bin/codex --yolo
54388 ttys039 23-20:16:38 7MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-a
27332 ttys042 26-01:06:33 0MB node /opt/homebrew/bin/codex --yolo
27333 ttys042 26-01:06:33 12MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
44818 ttys044 26-00:53:31 0MB node /opt/homebrew/bin/codex --yolo
44819 ttys044 26-00:53:31 13MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
41471 ttys045 26-00:55:55 65MB claude --dangerously-skip-permissions
45468 ttys046 26-00:53:08 0MB node /opt/homebrew/bin/codex --yolo
45469 ttys046 26-00:53:08 15MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
45349 ttys047 26-00:53:12 82MB claude --dangerously-skip-permissions
45263 ttys048 26-00:53:18 18MB grok --yolo
72194 ttys049 25-23:19:40 0MB node /opt/homebrew/bin/codex --yolo
72195 ttys049 25-23:19:40 12MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
28496 ttys050 24-11:13:53 100MB claude --dangerously-skip-permissions
79379 ttys052 26-00:25:35 178MB claude --dangerously-skip-permissions
58488 ttys053 25-17:15:58 107MB claude --dangerously-skip-permissions
56442 ttys054 25-23:32:47 120MB claude --dangerously-skip-permissions
72375 ttys055 25-23:19:38 0MB node /opt/homebrew/bin/codex --yolo
72376 ttys055 25-23:19:38 12MB /opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-
72704 ttys056 25-23:19:32 97MB claude --dangerously-skip-permissions
72616 ttys057 25-23:19:35 17MB grok --yolo
61940 ttys058 25-19:52:17 75MB claude --dangerously-skip-permissions
```

## Long-running dev servers / orphans (>1 day, node/electron/vite/bun)
```
973 35-21:35:06 1MB /Applications/Orca.app/Contents/Frameworks/Electron Framework.framework/Helpers/chrome_crashpad_hand
12594 24-01:23:56 1MB node clerk-electron.mjs session-check ./shots-electron
16229 34-23:28:28 1MB /Applications/Discord.app/Contents/Frameworks/Electron Framework.framework/Helpers/chrome_crashpad
39198 17-14:51:53 17MB /Users/worsin/.codex/worktrees/convexpress-hardening/ConvexPress-Admin/node_modules/.bun/electron
39225 17-14:51:53 8MB /Users/worsin/.codex/worktrees/convexpress-hardening/ConvexPress-Admin/node_modules/.bun/electron@
39226 17-14:51:53 7MB /Users/worsin/.codex/worktrees/convexpress-hardening/ConvexPress-Admin/node_modules/.bun/electron@
39229 17-14:51:53 8MB /Users/worsin/.codex/worktrees/convexpress-hardening/ConvexPress-Admin/node_modules/.bun/electron@
52415 26-00:48:15 12MB /Users/worsin/.cache/convex/binaries/precompiled-2026-08-25-7cce8fb/convex-local-backend --port 4
68944 22-11:30:13 10MB /Users/worsin/Development/EZ-Entity-Setup/ez-planner/bin/convex-local-backend --instance-name ano
71272 22-11:28:17 0MB bun run dev:web
71286 22-11:28:17 1MB node /Users/worsin/Development/EZ-Entity-Setup/ez-planner/node_modules/.bin/turbo -F web dev
71310 22-11:28:17 1MB /Users/worsin/Development/EZ-Entity-Setup/ez-planner/node_modules/.bun/@turbo+darwin-arm64@2.9.14/
71327 22-11:28:16 0MB /opt/homebrew/bin/bun run dev
71328 22-11:28:16 4MB node /Users/worsin/Development/EZ-Entity-Setup/ez-planner/apps/web/node_modules/.bin/vite dev --ho
92198 02-20:17:36 2MB /Applications/Aqua Voice.app/Contents/Frameworks/Electron Framework.framework/Helpers/chrome_crash
```

## Unread notes
- to-claude: 1
- to-codex:  1
