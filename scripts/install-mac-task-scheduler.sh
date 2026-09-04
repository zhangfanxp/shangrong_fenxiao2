#!/bin/zsh
set -eu

project_dir="${0:A:h:h}"
npm_path="$(command -v npm)"
node_path="$(command -v node)"
agent_dir="$HOME/Library/LaunchAgents"
agent_file="$agent_dir/com.canyin.task-scheduler.plist"
log_dir="$project_dir/data/logs"

mkdir -p "$agent_dir" "$log_dir"

escaped_project="${project_dir//&/&amp;}"
escaped_npm="${npm_path//&/&amp;}"
escaped_node_dir="${node_path:h}"

cat > "$agent_file" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.canyin.task-scheduler</string>
  <key>ProgramArguments</key>
  <array><string>$escaped_npm</string><string>run</string><string>tasks:scheduler:check</string></array>
  <key>WorkingDirectory</key><string>$escaped_project</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$escaped_node_dir:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$escaped_project/data/logs/task-scheduler.log</string>
  <key>StandardErrorPath</key><string>$escaped_project/data/logs/task-scheduler.error.log</string>
</dict>
</plist>
PLIST

/usr/bin/plutil -lint "$agent_file"

launchctl bootout "gui/$(id -u)/com.canyin.task-scheduler" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$agent_file"
launchctl enable "gui/$(id -u)/com.canyin.task-scheduler"
echo "任务生成、通知发布与数据库备份调度已安装并启动：$agent_file"
