// electron-vite 主进程构建支持 ?raw 导入，补充 TS 声明
declare module '*.html?raw' {
  const content: string
  export default content
}
