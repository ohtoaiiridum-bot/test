# 游戏清单

用单个文件 `GameList.html` 管理游戏列表（CSV 表格样式）。`index.html` 会跳转到它。

## 使用

浏览器直接打开 `GameList.html`，或：

```bash
python3 -m http.server 4173
```

然后访问 http://localhost:4173/GameList.html 。

数据保存在浏览器 `localStorage`。可导出 CSV / Markdown / JSON，也可把 CSV 或 JSON 再导回来。

## 功能

- 表格里直接改名称、分类、标签、备注
- 底部可追加一行；也可用弹窗添加 / 编辑
- 搜索、按分类筛选、点表头排序
- **重复项单独成表**：同名条目从主表抽出，可「只留这条」或整组去重
- 名字接近但不完全相同的条目会列在「可能重复」
