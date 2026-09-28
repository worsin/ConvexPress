#!/bin/zsh
# Machine-health audit. Prints markdown to stdout. Usage: audit.sh [--save]
set -u; setopt null_glob
ROOT="${0:A:h:h}"
NOW=$(date '+%Y-%m-%d %H:%M:%S'); STAMP=$(date '+%Y-%m-%d-%H%M')
CORES=$(sysctl -n hw.ncpu); MEMGB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
LOAD=$(sysctl -n vm.loadavg | awk '{print $2}')
SWAP_USED=$(sysctl -n vm.swapusage | sed -E 's/.*used = ([0-9.]+)M.*/\1/'); SWAP_TOT=$(sysctl -n vm.swapusage | sed -E 's/.*total = ([0-9.]+)M.*/\1/')
SWAP_GB=$(printf '%.1f' $(( SWAP_USED / 1024.0 ))); SWAPT_GB=$(printf '%.1f' $(( SWAP_TOT / 1024.0 )))
VM=$(vm_stat); PG=16384
free_mb=$(echo "$VM" | awk -v p=$PG '/Pages free/{gsub("\\.","",$3); printf "%d", $3*p/1048576}')
wired_gb=$(echo "$VM" | awk -v p=$PG '/wired down/{gsub("\\.","",$4); printf "%.1f", $4*p/1073741824}')
comp_gb=$(echo "$VM" | awk -v p=$PG '/occupied by compressor/{gsub("\\.","",$5); printf "%.1f", $5*p/1073741824}')
MEMLVL=$(sysctl -n kern.memorystatus_level 2>/dev/null || echo '?')
UPT=$(uptime | sed -E 's/.*up ([^,]+(, *[0-9]+:[0-9]+)?),.*/\1/')
UPDAYS=$(uptime | grep -oE 'up [0-9]+ day' | grep -oE '[0-9]+' || echo 0)
DISK=$(df -h /System/Volumes/Data | awk 'NR==2{print $5" used, "$4" free"}'); DISKPCT=$(df /System/Volumes/Data | awk 'NR==2{gsub("%","",$5); print $5}')
NPROC=$(ps -A | wc -l | tr -d ' '); NTHR=$(ps -AM 2>/dev/null | wc -l | tr -d ' ')
# agent sessions
stale_codex=$(pgrep -f 'bin/codex --yolo' | wc -l | tr -d ' ')
n_claude=$(pgrep -x claude | wc -l | tr -d ' ')
n_grok=$(pgrep -f '^grok ' | wc -l | tr -d ' ')
n_node=$(pgrep -x node | wc -l | tr -d ' '); n_npm=$(pgrep -f '^npm ' | wc -l | tr -d ' ')
n_mcp=$(pgrep -f '^node .*(chrome-devtools-mcp|playwright-mcp|context7-mcp)' | wc -l | tr -d ' ')
# codex app
codex_app_pid=$(pgrep -x ChatGPT | head -1)
if [ -n "$codex_app_pid" ]; then
  desc() { echo $1; for c in $(pgrep -P $1); do desc $c; done; }
  pids=$(desc $codex_app_pid | tr '\n' ','); pids=${pids%,}
  codex_app_mb=$(ps -o rss= -p "$pids" | awk '{s+=$1} END{printf "%d", s/1024}'); codex_app_n=$(echo $pids | tr ',' '\n' | wc -l | tr -d ' ')
  codex_app_up=$(ps -o etime= -p $codex_app_pid | tr -d ' ')
  renderer=$(top -l 1 -o mem -n 40 -stats pid,mem,cmprs,command 2>/dev/null | grep 'Codex (Renderer)' | head -1 | awk '{print "pid "$1" mem "$2" compressed "$3}')
else codex_app_mb=0; codex_app_n=0; codex_app_up="not running"; renderer="n/a"; fi
docker_mem=$(python3 -c "import json;print(json.load(open('$HOME/Library/Group Containers/group.com.docker/settings-store.json')).get('MemoryMiB','?'))" 2>/dev/null || echo '?')
docker_running=$(docker info --format '{{.ContainersRunning}}' 2>/dev/null || echo 'off')
codex_dir=$(du -sh ~/.codex 2>/dev/null | awk '{print $1}')
big_sessions=$(find ~/.codex/sessions ~/.codex/archived_sessions -type f -size +100M 2>/dev/null | wc -l | tr -d ' ')
# verdict
VERDICT=OK; WHY=""
if (( SWAP_USED > 12288 )) || (( free_mb < 200 )) || (( $(printf '%.0f' $LOAD) > CORES*2 )); then VERDICT=CRIT; WHY="swap ${SWAP_GB}GB, free ${free_mb}MB, load ${LOAD}"
elif (( SWAP_USED > 6144 )) || (( stale_codex + n_claude + n_grok > 5 )) || (( DISKPCT > 90 )) || (( UPDAYS > 21 )); then VERDICT=WARN; WHY="swap ${SWAP_GB}GB, agent sessions $((stale_codex+n_claude+n_grok)), disk ${DISKPCT}%, uptime ${UPDAYS}d"; fi
out=$(cat <<MD
# Machine audit $NOW
**Verdict: $VERDICT** — $WHY

| Metric | Value |
|---|---|
| Load (1m) / cores | $LOAD / $CORES |
| RAM free / wired / compressor | ${free_mb} MB / ${wired_gb} GB / ${comp_gb} GB of ${MEMGB} GB |
| Swap used | ${SWAP_GB} / ${SWAPT_GB} GB |
| kern.memorystatus_level | $MEMLVL (lower = more pressure) |
| Uptime | $UPT |
| Disk (Data) | $DISK |
| Processes / threads | $NPROC / $NTHR |
| Codex app | $codex_app_n procs, ${codex_app_mb} MB RSS, up $codex_app_up |
| Codex renderer | $renderer |
| Stale codex TUIs / claude / grok | $stale_codex / $n_claude / $n_grok |
| node / npm / MCP servers | $n_node / $n_npm / $n_mcp |
| Docker | VM limit ${docker_mem} MiB, running containers: $docker_running |
| ~/.codex size / sessions >100MB | $codex_dir / $big_sessions |

## Top 12 by real footprint (mem, compressed)
\`\`\`
$(top -l 1 -o mem -n 12 -stats pid,mem,cmprs,command 2>/dev/null | tail -13)
\`\`\`

## Top 8 by CPU (2s sample)
\`\`\`
$(top -l 2 -s 2 -o cpu -n 8 -stats pid,cpu,mem,command 2>/dev/null | tail -9)
\`\`\`

## Agent sessions older than 1 day
\`\`\`
$(ps -Aeo pid,tty,etime,rss,command | grep -E 'bin/codex --yolo|^ *[0-9]+ +[^ ]+ +[^ ]+ +[0-9]+ +(claude|grok)( |$)' | grep -v grep | grep -E '[0-9]+-[0-9]{2}:' | awk '{$4=int($4/1024)"MB"; print}' | cut -c1-110)
\`\`\`

## Long-running dev servers / orphans (>1 day, node/electron/vite/bun)
\`\`\`
$(ps -Aeo pid,etime,rss,command | grep -E '[0-9]+-[0-9]{2}:' | grep -iE 'vite|electron|turbo|next dev|bun run|tsserver|convex-local' | grep -v grep | awk '{$3=int($3/1024)"MB"; print}' | cut -c1-120 | head -15)
\`\`\`

## Unread notes
- to-claude: $(ls $ROOT/notes/to-claude/*.md 2>/dev/null | wc -l | tr -d ' ')
- to-codex:  $(ls $ROOT/notes/to-codex/*.md 2>/dev/null | wc -l | tr -d ' ')
MD
)
if [ "${1:-}" = "--save" ]; then
  f=$ROOT/audits/$STAMP.md; print -r -- "$out" > "$f"; cp "$f" $ROOT/LATEST.md; echo "saved $f (verdict $VERDICT)"
else print -r -- "$out"; fi
