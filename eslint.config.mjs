import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // 界面文案里的 // 是故意显示的分隔符，不是漏写进花括号的注释
      "react/jsx-no-comment-textnodes": "off",
    },
  },
];

export default eslintConfig;
