/** خطاف تحميل: يحوّل مسارات المتصفح المطلقة (/shared/*, /js/*) إلى ملفات حقيقية لاختبار العميل في Node */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('/shared/')) return next(pathToFileURL(path.join(ROOT, 'shared', specifier.slice(8))).href, context);
  if (specifier.startsWith('/js/')) return next(pathToFileURL(path.join(ROOT, 'public', 'js', specifier.slice(4))).href, context);
  if (specifier.startsWith('/css/')) return { url: pathToFileURL(path.join(ROOT, 'public', specifier)).href, shortCircuit: true, format: 'module' };
  return next(specifier, context);
}
