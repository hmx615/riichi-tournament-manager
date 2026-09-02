import { getAvatar } from "@/server/avatar-storage";
import { getPerson } from "@/server/person-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  if (!/^[a-z0-9-]+$/.test(personId)) return new Response("Not found", { status: 404 });
  const person = await getPerson(personId);
  if (!person?.avatarKey || !person.avatarContentType) return new Response("Not found", { status: 404 });
  const avatar = await getAvatar(person.avatarKey);
  if (!avatar) return new Response("Not found", { status: 404 });
  return new Response(avatar.body, {
    headers: {
      "Content-Type": person.avatarContentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ...(avatar.etag ? { ETag: avatar.etag } : {}),
    },
  });
}
