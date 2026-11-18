# 下载项目后在本机部署

更新日期：2026-11-15。适用于Windows、Linux、macOS单机使用或上线前验收。普通用户运行，无需root、gzh用户、Nginx或systemd。公网Ubuntu部署见[完整服务器指南](SELF_HOSTED.md)。

这里运行一期Node自托管版，提供访客排版、个人API、本机方案和草稿备份；登录、注册、服务器图片上传、我的文章、爆文发现和我的选题暂不开放，见[发布范围](RELEASE_SCOPE.md)。基础排版无需购买或填写API密钥；AI功能使用自行配置的个人API。

## 1. 下载与环境

从[项目仓库](https://github.com/zhouwei713/luobo-gzh-design)选择Code → Download ZIP，解压到独立目录。也可使用[master源码ZIP](https://github.com/zhouwei713/luobo-gzh-design/archive/refs/heads/master.zip)。源码包只有已推送代码；本地未推送改动不会出现在下载包中。[GitHub说明](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives)

解压后应有app、server、worker三个目录，不能只下载app。下文Windows示例为`D:\gzh\luobo-gzh-design-master`，Linux/macOS为`$HOME/gzh/luobo-gzh-design-master`，按实际路径替换。

Node.js现有22.22.2可试运行，也支持24.13+，以server/package.json的engines为准。通过[Node官网](https://nodejs.org/en/download)安装兼容版本后重新打开终端。源码ZIP不含依赖和构建结果，也不含真实.env或用户数据。

**执行用户：本机普通用户。Windows PowerShell、Linux/macOS终端均可执行。**

```text
node --version
npm --version
```

Windows若PowerShell禁止执行npm.ps1，以下npm命令可改用npm.cmd，无需改变全局执行策略。每条命令确认成功再执行下一条，构建失败时先解决。

## 2. 安装依赖和构建

**执行用户：Windows当前普通用户，PowerShell。将第一行路径改为实际解压目录。**

```powershell
Set-Location 'D:\gzh\luobo-gzh-design-master\app'
npm ci
npm run build:server
Set-Location '..\server'
npm ci
npm run build
```

**执行用户：Linux/macOS当前普通用户。与Windows步骤二选一。**

```bash
cd "$HOME/gzh/luobo-gzh-design-master/app"
npm ci
npm run build:server
cd ../server
npm ci
npm run build
```

生成app/dist及server/dist。前端必须使用build:server；不要使用面向Cloudflare的deploy或preview命令。无需安装worker依赖或运行Wrangler，但worker源码须保留。

## 3. 创建本地.env

在server目录操作，已有.env则保留，不覆盖。已部署服务器的数据不要拿来做免登录调测。

**执行用户：Windows当前普通用户，PowerShell。当前目录为server。**

```powershell
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
notepad .env
```

**执行用户：Linux/macOS当前普通用户。当前目录为server。**

```bash
test -f .env || cp .env.example .env
chmod 600 .env
nano .env
```

配置内容如下，修改已有键，避免重复。端口3100须空闲，本地固定使用127.0.0.1访问，避免与localhost混用。

```dotenv
NODE_ENV=development
LOCAL_DISCOVERY_DEBUG=0
ENABLE_PHASE2=0
HOST=127.0.0.1
PORT=3100
PUBLIC_URL=http://127.0.0.1:3100
DATA_DIR=./data
STATIC_DIR=../app/dist
TRUST_PROXY_LOOPBACK=0
CREDENTIALS_ENCRYPTION_KEY=
CHROMIUM_EXECUTABLE_PATH=
```

API密钥可先留空。AI排版、封面和图文生成使用“工作台设置”中的个人API Key、Base URL及模型，游客和登录用户均可配置，保存在当前浏览器；接口需要支持浏览器跨域访问。后端REDFOX_API_KEY用于管理员采集，后端OPENAI配置仍用于已有选题简报等接口。会员平台API后续单独开放，见[待办](TODO.md)。调用外部服务可能消耗额度，不会因完成安装就自动采集。

CREDENTIALS_ENCRYPTION_KEY留空时首次启动生成data/.credentials-key，后续保留并配套备份。CHROMIUM_EXECUTABLE_PATH先留空，服务端截图使用已有SVG回退；如需真实浏览器PNG，再配置本机Chrome/Chromium并单独验收。浏览器内的图片导出单独验证。

## 4. 启动和访问

**执行用户：当前普通用户。Windows、Linux、macOS均在server目录运行。**

```text
npm start
```

保持该终端运行，在浏览器打开`http://127.0.0.1:3100`。另开终端检查health。

**执行用户：Windows当前普通用户，PowerShell。**

```powershell
Invoke-RestMethod 'http://127.0.0.1:3100/health'
```

**执行用户：Linux/macOS当前普通用户。**

```bash
curl -f http://127.0.0.1:3100/health
```

在网站登录入口注册，用户信息存SQLite，普通注册默认free。正式账号和文章可用真实登录验收。完成后在启动终端按Ctrl+C退出，终端关闭后本地网站不再可访问。

如果端口占用，修改PORT和PUBLIC_URL为同一个空闲端口，再重启，不停止其他项目的程序。

## 5. 可选：创建管理员

在另一个终端进入同一server目录，邮箱改为尚未注册的自己的邮箱；脚本不会覆盖已有账号。密码8至128位且含字母和数字。密码不写进命令历史。

**执行用户：Windows当前普通用户，PowerShell。**

```powershell
$adminSecure = Read-Host '设置管理员密码' -AsSecureString
$adminPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecure)
try {
    $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPtr)
    npm run admin -- admin@example.com
} finally {
    Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPtr)
}
```

**执行用户：Linux/macOS当前普通用户，Bash。**

```bash
read -rsp '设置管理员密码：' ADMIN_PASSWORD
printf '\n'
export ADMIN_PASSWORD
npm run admin -- admin@example.com
unset ADMIN_PASSWORD
```

一期管理员也不展示采集管理区域。RedFox采集和选题库仅供二期开发测试。

## 6. 可选：二期本地开发调测

一期构建不展示二期。需要继续开发爆文与选题时，先停止npm start，改用Vite开发前端；它会通过本地插件连接二期后端，无需另开dev:local。第2节的server构建须先成功。以下使用独立测试目录，不能指向生产数据。工作台设置中的“调试身份”控制模拟身份，真实登录会话优先；免登录调测不能调用付费采集接口。

**执行用户：Windows当前普通用户，PowerShell，server目录开始。**

```powershell
$env:GZH_LOCAL_DATA_DIR = Join-Path (Get-Location).Path 'data-local-debug'
try {
    Set-Location '..\app'
    npm run dev
} finally {
    Remove-Item Env:GZH_LOCAL_DATA_DIR -ErrorAction SilentlyContinue
}
```

**执行用户：Linux/macOS当前普通用户，server目录开始。**

```bash
cd ../app
GZH_LOCAL_DATA_DIR="$(pwd)/../server/data-local-debug" npm run dev
```

打开Vite终端实际输出的本机地址，通常为http://localhost:5173；端口占用时以终端为准。开发配置.oss启用VITE_ENABLE_PHASE2=true，生产构建忽略此开关。调试服务只用于本机，不绑定0.0.0.0或暴露公网。结束后Ctrl+C停止并确认退出。单独dev:local只启动开发后端，不能让已构建的一期前端显示二期。

## 7. 数据、更新与排错

默认持久数据在server/data，含gzh.sqlite、objects和.credentials-key，.env在server目录。备份时先Ctrl+C停止服务，再复制完整data和.env到私有位置。更新前备份，不能只复制运行中的SQLite主文件。

ZIP安装没有.git。下载新包解压到独立目录，重新构建，停旧服务后复制原.env与完整data并保留密钥，再启动新版本。旧代码和配套备份先保留，避免直接覆盖。不要把旧node_modules跨系统复制到新环境。

常见问题：

- EBADENGINE：核对当前终端Node版本及server/package.json要求。
- Cannot find module或dist缺失：核对完整目录、npm ci和两段构建是否完成。
- EADDRINUSE：端口占用，改PORT和PUBLIC_URL后重启。
- health成功但页面503：确认app/dist存在且STATIC_DIR=../app/dist。
- HTTP本地登录异常：核对NODE_ENV=development，使用配置中的完整127.0.0.1地址；迁往公网时按服务器指南改为production和HTTPS。
- 修改.env：停止并重启Node进程才能生效。
- 外部图片加载失败：源站链接过期、防盗链或网络原因需单独处理，源码下载不会自动迁移文章原图。

本次更新核对了脚本入口与配置，未执行从公网下载ZIP后的完整跨平台安装；此前Node22.22.2本地兼容性记录见[NODE22_VALIDATION.md](NODE22_VALIDATION.md)。公网权限、证书及真实供应商调用需各自验收。
