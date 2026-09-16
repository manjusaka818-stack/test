# GitHub Pages 项目目录

本仓库用于集中部署多个互相独立的静态网页项目。

项目入口：<https://manjusaka818-stack.github.io/test/>

## 目录约定

```text
/
├─ .github/workflows/deploy-pages.yml
├─ .nojekyll
├─ index.html
└─ projects/
   └─ obs-transparent-overlay/
      ├─ index.html
      ├─ style.css
      ├─ script.js
      └─ README.md
```

以后新增部署放在 `projects/<项目名>/` 下，并在根目录 `index.html` 中增加对应分类和入口。

## 已部署项目

### 直播工具 / OBS

- [OBS 透明动态覆盖层](https://manjusaka818-stack.github.io/test/projects/obs-transparent-overlay/)
