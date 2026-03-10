# 支付宝 MCP 本地接入说明

## 已完成内容
- 已创建配置文件：`scripts/alipay-mcp.env`
- 已创建配置模板：`scripts/alipay-mcp.env.example`
- 已创建服务启动脚本：`scripts/start-alipay-mcp.bat`
- 已创建调试启动脚本：`scripts/start-alipay-inspector.bat`

## 必填参数说明
- `AP_APP_ID`：支付宝开放平台应用 ID（已填）
- `AP_APP_KEY`：应用私钥（必须你自己补齐）
- `AP_PUB_KEY`：支付宝公钥（已填）
- `AP_RETURN_URL`：同步回跳地址（已填）
- `AP_NOTIFY_URL`：异步通知地址（已填）

## 关键提醒
- 你当前提供的是“应用公钥”和“支付宝公钥”。
- `AP_APP_KEY` 位置需要“应用私钥”，公钥不能代替私钥。
- 如果私钥不正确，创建支付单和查询接口会签名失败。

## 运行方式
1. 编辑 `scripts/alipay-mcp.env`，把 `AP_APP_KEY=__REPLACE_WITH_APP_PRIVATE_KEY__` 替换为真实应用私钥。
2. 直接双击运行：`scripts/start-alipay-mcp.bat`
3. 需要图形调试时运行：`scripts/start-alipay-inspector.bat`

## export 方式（Git Bash / WSL）
你提到的方式可直接使用，示例如下：
```bash
set -a
source scripts/alipay-mcp.env
set +a
npx -y @modelcontextprotocol/inspector npx -y @alipay/mcp-server-alipay
```

也可以直接运行脚本：
```bash
bash scripts/start-alipay-inspector.sh
```

## Windows CMD 方式
```cmd
cmd /c scripts\start-alipay-inspector.bat
```

## MCP 客户端配置示例（Windows）
```json
{
  "mcpServers": {
    "mcp-server-alipay": {
      "command": "cmd",
      "args": [
        "/c",
        "<project-root>\\scripts\\start-alipay-mcp.bat"
      ]
    }
  }
}
```

## 工具白名单
当前配置为：
- `AP_SELECT_TOOLS=create-alipay-payment-agent,query-alipay-payment`

如需退款相关工具，可改成：
- `AP_SELECT_TOOLS=all`
