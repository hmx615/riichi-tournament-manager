export function personIdError(value: string) {
  const id = value.trim();
  if (!id) return "人物 ID 不能为空";
  if (id.length > 40) return "人物 ID 不能超过 40 个字符";
  if (id === "." || id === "..") return "人物 ID 不能使用路径保留名称";
  if (/[\\/]/.test(id)) return "人物 ID 不能包含斜杠";
  if ([...id].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  })) return "人物 ID 不能包含控制字符";
  return null;
}

export function isValidPersonId(value: string) {
  return personIdError(value) === null;
}
