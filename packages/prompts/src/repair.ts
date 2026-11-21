import type { Issue } from '@stick/pipeline'

const UNKNOWN_CODES = new Set(['unknown_action', 'unknown_prop', 'unknown_backdrop'])

/** `code` is printed as a plain string so codes added later (schema, missing_line) need no change here. */
export function repairUser(issues: Issue[]): string {
  const lines = issues.map((i) => `${i.code} ${i.path} ${i.message}`)
  const parts = [
    'Kịch bản trước có các lỗi sau (mỗi dòng: code path message):',
    lines.join('\n'),
  ]
  if (issues.some((i) => UNKNOWN_CODES.has(i.code))) {
    parts.push('Với mỗi action/prop/backdrop không tồn tại: thay bằng thứ có trong catalog, gần nghĩa nhất. Không tự bịa id mới.')
  }
  parts.push('Hãy trả về TOÀN BỘ kịch bản đã sửa (không chỉ phần lỗi), giữ nguyên mọi thứ không liên quan đến lỗi, đúng schema JSON.')
  return parts.join('\n\n')
}
