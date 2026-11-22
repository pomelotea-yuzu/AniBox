/**
 * onnxruntime-node@1.20.1 未随包提供类型声明（TS7016）。
 * 本项目仅在 local-translate.ts 中用 listSupportedBackends() 做后端诊断，
 * 声明最小 API 即可；其余 API 按需扩展。
 */
declare module 'onnxruntime-node' {
  export function listSupportedBackends(): Record<string, boolean>
}
