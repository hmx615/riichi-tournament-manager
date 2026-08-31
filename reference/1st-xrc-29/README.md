# 1st XRC 29 场固定基准

本目录保存 2026-08-27 确认的 29 场版本，用于新网站的导入与回归测试。

- 固定网页：`1st_XRC_四人数据对比.html`
- 牌谱清单：`XRC牌谱录入.txt`
- 统计脚本：`build_xrc_dashboard.js`、`mrc_stats.js`
- 页面模板：`xrc_dashboard_template.html`
- 分数与 Rating：`1st XRC.xlsx`
- 天凤原始数据缓存：`cache/`

这些文件不作为新网站的运行时数据库。修改前应先确认是否需要建立新的基准版本，并通过 `sha256sum -c SHA256SUMS` 检查核心文件。
