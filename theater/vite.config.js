import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 打成单个 HTML：双击即可离线打开（赛场无网兜底）
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
});
