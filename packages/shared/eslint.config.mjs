import { defineConfig, globalIgnores } from 'eslint/config';
import { baseConfig } from '../../eslint.base.mjs';

export default defineConfig(globalIgnores(['dist/']), baseConfig(import.meta.dirname));
