# 静态网页版发布

v0.18.3 是可以独立部署的纯前端游戏。主菜单、战斗、生产、研究、音乐、存档和蓝图导入导出均在浏览器中执行；不需要账号服务、数据库或后端 API。当前尚未发布到公网。

## 使用发布包

1. 执行 `python tools/build.py`。
2. 解压 `dist/blueprint-defense-web.zip`。
3. 将包内的 `index.html`、`blueprint_defense.html`、`assets/`、`styles/`、`scripts/`、`data/` 与 `_headers` 一起上传到网站目录。
4. 通过网站的 HTTPS 地址打开 `index.html`；也支持 `/game/index.html` 这样的子目录。

所有资源使用相对路径。服务器只需返回静态文件，并正确提供 JS、JSON、CSS、WOFF2、图片和 MP3 类型。无需将子目录资源请求重写成 HTML。`_headers` 是可识别此格式的静态平台的缓存配置；其他服务器可以配置等效规则：带哈希的资源长期缓存，HTML 入口每次检查更新。

请使用发布 ZIP 的内容，不要把整个开发目录或 dist 目录一起上传：dist 可能保留旧哈希缓存文件，还含约 38 MiB 的离线单文件。原始字体、WEM、原始表和开发工具不在发布包中。

存档保存在访问者浏览器内。更换域名、协议或端口会使用新的存储；迁移前可在菜单导出存档，在新网址导入。刷新或恢复后保持暂停，不结算离线生产。开始战斗需要用户点击，音乐和音效随用户操作启用。

## 字体与加载

HarmonyOS Sans SC 原文件为 20,617,156 字节。现在发布 58 个 WOFF2 可变字体分片：Latin 和游戏常用字共 361,744 字节（353.3 KiB），其他 56 片通过 `unicode-range` 按实际出现的字符下载。保留原字体的 29,508 个字符、40–900 可变字重、字形特性和许可信息；原始 TTF 保留在工程中，网页不再引用。

字体总资源为 12.44 MiB，但浏览器不会首次全部请求。发布包整体约 27.6 MiB，包含全部备用字体、音乐和动画；完整包体积不等于首次下载量。角色动画和音乐继续按需读取，字体失败时使用系统字体，网页启动不等待字体。

画布常用文字使用明确的字符集预加载，避免只加载拉丁文后一直以系统中文字体绘制。普通与粗体的中文、数字、符号和生僻字已经与原字体进行画布像素对比，结果一致。离线单文件内嵌全部 WOFF2 分片，可直接打开。

字体维护：

```powershell
python -m pip install -r requirements-fonts.txt
python tools/prepare_fonts.py
python tools/build.py
```

日常构建只读取已生成的分片，不需要 FontTools 或 Brotli。添加新文案时，完整字库仍能覆盖原字体支持的文字；若新文案触发较多备用片，可重新运行分片工具，将其纳入常用集合。构建会检查分片哈希，普通构建不改变存档规则指纹。

实现参考：[FontTools subset](https://fonttools.readthedocs.io/en/latest/subset/index.html)、[CSS unicode-range](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face/unicode-range)。

## 独立发布验证

```powershell
python tools/test_web_release.py
```

该命令从实际 ZIP 解压到临时目录，用普通静态 HTTP 服务挂载到 `/game/`，验证菜单、建造、存档、蓝图、音乐、动画延迟加载、移动布局、字体分片与错误恢复。还会检查发布包是否完整、资源哈希是否匹配，确保未混入原始 TTF 和 WEM。测试结束后关闭临时服务并清理临时副本。

v0.18.3 本轮通过 22 项发布相关浏览器检查。报告为 `reports/web_release_verification.json`，归档摘要见 `docs/verification/v0.18.3.json`。上一版完整玩法回归记录单独保留，本轮没有改动战斗或经济规则。
