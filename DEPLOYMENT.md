# 一键发布说明

本项目按纯静态网站发布：`index.html` + `assets/` + `audio/`，没有后端、数据库或服务器逻辑。

## 部署方式

默认使用 GitHub Pages + GitHub Actions：

- CDN 托管：GitHub Pages
- 自动发布：`.github/workflows/deploy.yml`
- 构建产物：`dist/`
- 固定访问地址：`https://<GitHub用户名>.github.io/<仓库名>/`

## 首次上线

1. 在 GitHub 创建一个仓库，例如 `ear-training`。
2. 在本地项目目录执行：

```bash
git init
git branch -M main
git add .
git commit -m "Initial static deployment"
git remote add origin https://github.com/<GitHub用户名>/<仓库名>.git
git push -u origin main
```

3. 打开 GitHub 仓库的 `Settings -> Pages`。
4. 将 `Build and deployment -> Source` 设置为 `GitHub Actions`。
5. 等待 `Actions -> Deploy Static Site` 完成。

## 后续一键发布

macOS 可以双击：

```text
mac一键发布.command
```

Windows 可以双击：

```text
windows一键发布.bat
```

脚本会自动完成：构建 -> 更新音频清单 -> git add -> git commit -> git push。

也可以手动执行：

```bash
python3 tools/build_static.py
git add .
git commit -m "Update site"
git push
```

推送后 GitHub Actions 会自动完成：

构建 `dist/` -> 上传 Pages artifact -> 发布 -> 更新固定 URL。

也可以在 GitHub 仓库页面进入 `Actions -> Deploy Static Site -> Run workflow` 手动发布当前 `main` 分支。

## 音频资源

- 默认音频放在 `audio/imports/<track>/`。
- 发布前构建脚本会自动更新 `audio/imports/manifest.json`。
- 页面首屏只扫描 manifest，不会立即解码大音频。
- 用户点击播放或手动加载音频后，才会初始化 Web Audio API 并解码音频。

## 本地验证

```bash
python3 tools/build_static.py
python3 -m http.server 8642 -d dist
```

然后打开：

```text
http://localhost:8642/
```
