# 蓝图防线

独立的蓝图风格同人塔防项目，当前功能基线为 **v0.17**。包含生产、局内科技、10 波战役、罗丹、原版建筑占地、可配置快捷栏和批量选取／移动／拆除。

## 启动

构建和运行仅需 Python 3.10+ 与浏览器，无需 Unity、Blender、游戏安装目录或外部解包工具包。

```powershell
python tools/build.py
python tools/serve.py
```

打开 <http://127.0.0.1:8770/blueprint_defense.html>。默认使用 8770 端口，避免与旧项目的 8768 服务冲突；可用 `--port 端口号` 修改。也可以直接打开构建出的 `dist/blueprint_defense.html`，素材、字体、音效和动画均已内嵌，支持离线运行。

快捷栏预设保存在浏览器本地，切换端口或使用离线文件时会使用各自的预设；本轮迁移不改变战斗与经济规则。

## 开发与检查

完整验证另需 Node.js 20+、Google Chrome、Playwright 与 Pillow：

```powershell
npm install
python -m pip install -r requirements-dev.txt
python tools/build.py
python tools/test_current.py
```

也提供 `npm run build`、`npm run dev` 和 `npm test`。测试默认读取离线页面；`BLUEPRINT_TEST_URL` 可指定当前服务地址。`NODE_BINARY` 可指定 Node 路径；未安装项目依赖时，检查脚本支持复用本机 Codex 随附的 Node / Playwright。

`tools/test_current.py` 是当前版本的回归入口。部分历史测试文件对应旧经济与旧地图，不应直接用通配符运行全部 `tests/*.test.cjs`。报告与截图输出到 `reports/`，不加入 Git。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `src/` | 游戏逻辑、界面、画布和生成的当前配置 |
| `assets/` | 已处理的贴图、动画图集、音效与 HarmonyOS Sans SC 字体 |
| `sources/` | 构建所需的原版表、素材来源、攻击／占地／接口证据 |
| `tools/build.py` | 离线单文件构建；所有输入来自当前项目 |
| `tools/economy_config.py` | 科技、经济、高级塔与弹药配置 |
| `tools/production_config.py` | 生产扩展与兑换配置 |
| `tests/` | 当前回归与明确固定版本的历史用例 |
| `tools/archive/` | 历史素材提取、转换和试玩脚本，仅供取证与迁移参考 |
| `docs/baseline/` | 分离前的验证报告与历史试玩结论 |
| `dist/`、`reports/` | 构建与验证输出，由 Git 忽略 |

构建会更新 `src/data.json` 和 `sources/` 下的派生参考文件；修改配置后应构建并一并提交这些文件。

玩法、操作、配方与数值详见 [玩法说明](docs/GAMEPLAY.md)。迁移范围与后续优化入口见 [开发交接](docs/HANDOFF.md)。

素材来自本地解包和用户提供的文件，来源记录随项目保留；字体许可位于 `assets/fonts/LICENSE.txt`。本仓库未为第三方素材重新授予许可，也未配置远程发布。
