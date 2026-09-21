# 蓝图防线

独立的蓝图风格同人塔防项目，当前版本为 **v0.18**。包含生产、局内科技、10 波战役、罗丹、原版建筑占地、可配置快捷栏和批量选取／移动／拆除。网页版新增主菜单、加载进度、自动存档、存档备份和蓝图文件分享，全部在浏览器内完成。

## 启动

构建和运行仅需 Python 3.10+ 与浏览器，无需 Unity、Blender、游戏安装目录或外部解包工具包。

```powershell
python tools/build.py
python tools/serve.py
```

打开 <http://127.0.0.1:8770/blueprint_defense.html>。默认使用 8770 端口，避免与旧项目的 8768 服务冲突；可用 `--port 端口号` 修改。

同一构建命令生成三份输出：

- `dist/index.html` / `dist/blueprint_defense.html`：网页入口，素材使用独立文件；须通过 HTTP 服务访问。
- `dist/blueprint-defense-web.zip`：可发布的完整静态网页包，解压后将其中内容部署到静态托管。只包含当前网页及其资源，不含离线大文件、原始表和开发工具。
- `dist/offline/blueprint_defense.html`：素材、字体、音效与动画全部内嵌的离线版，可以直接打开；首次进入战场，已有存档时先显示菜单，通过顶部「菜单」管理存档。

网页首次加载后进入主菜单。常用设备图像就绪即可开始；HarmonyOS Sans SC 在后台加载，角色动画按需载入，音效在用户操作后启用并按需读取。资源名包含内容哈希，支持浏览器缓存；加载失败可重试。

快捷栏和进度保存在当前浏览器，切换网址、端口、浏览器或离线文件时使用各自的存储。需要换环境时先在「菜单」导出存档，再导入目标环境。

## 保存与分享

- **自动存档**：每 10 秒保存本局；打开菜单、切出页面和退出页面时也尝试保存。包括在途炮弹、连射队列、敌人状态、生产缓存、科技、库存和视角。继续战斗存档时保持暂停，不计算离线收益。
- **独立模式**：全线防守与罗丹挑战各有一个本地存档，可在菜单中选择。新开局会确认覆盖目标模式的进度，并重新研究科技。
- **备份**：菜单可导出／导入 JSON 存档；导入先验证版本、建筑占地和数据，确认后才替换进度。浏览器拒绝存储时会提示使用导出备份。
- **蓝图**：战场顶部「蓝图」可导出全图或 X 框选的设备。导入后设置放置起点，检查占地、科技、折金票和制造材料；整组放置成功后才扣款。包含炮塔等级、设备朝向和配方，不附带库存、机内物料或研究进度。

存档使用 IndexedDB，并以 localStorage 保存退出时的备用快照。浏览器清理站点数据会删除本地进度，导出的文件可作为备份。不同规则版本的存档会被拒绝，避免按变化后的配方、地图或数值错误恢复。

## 开发与检查

完整验证另需 Node.js 20+、Google Chrome、Playwright 与 Pillow：

```powershell
npm install
python -m pip install -r requirements-dev.txt
python tools/build.py
python tools/test_current.py
```

也提供 `npm run build`、`npm run dev` 和 `npm test`。测试默认读取离线页面；`BLUEPRINT_TEST_URL` 可指定当前服务地址。`NODE_BINARY` 可指定 Node 路径；未安装项目依赖时，检查脚本支持复用本机 Codex 随附的 Node / Playwright。

`tools/test_current.py` 是当前版本的回归入口：先检查离线版和逻辑，再自动启动临时本地服务验证网页菜单、持久化、导入／导出、动画音效延迟加载及错误恢复。当前报告为 `reports/v18_verification.json`。部分历史测试文件对应旧经济与旧地图，不应直接用通配符运行全部 `tests/*.test.cjs`。报告与截图输出到 `reports/`，不加入 Git。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `src/` | 游戏逻辑、界面、画布和生成的当前配置 |
| `assets/` | 已处理的贴图、动画图集、音效与 HarmonyOS Sans SC 字体 |
| `sources/` | 构建所需的原版表、素材来源、攻击／占地／接口证据 |
| `tools/build.py` / `tools/web_build.py` | 网页资源、静态发布包及离线单文件构建；所有输入来自当前项目 |
| `src/session.js` / `src/local_store.js` | 存档编解码与校验、蓝图原子放置、浏览器存储 |
| `src/session_ui.js` / `src/session.html` / `src/session.css` | 主菜单、设置、存档和蓝图操作界面 |
| `src/web_boot.js` | 网页启动、进度与错误重试 |
| `tools/economy_config.py` | 科技、经济、高级塔与弹药配置 |
| `tools/production_config.py` | 生产扩展与兑换配置 |
| `tests/` | 当前回归与明确固定版本的历史用例 |
| `tools/archive/` | 历史素材提取、转换和试玩脚本，仅供取证与迁移参考 |
| `docs/baseline/` | 分离前的验证报告与历史试玩结论 |
| `dist/`、`reports/` | 构建与验证输出，由 Git 忽略 |

构建会更新 `src/data.json` 和 `sources/` 下的派生参考文件；修改配置后应构建并一并提交这些文件。

玩法、操作、配方与数值详见 [玩法说明](docs/GAMEPLAY.md)。迁移范围与后续优化入口见 [开发交接](docs/HANDOFF.md)。

素材来自本地解包和用户提供的文件，来源记录随项目保留；字体许可位于 `assets/fonts/LICENSE.txt`。本仓库未为第三方素材重新授予许可，也未配置远程发布。
