import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { createDb } from '../../db/client'
import { users } from '../../db/schema'

export const GET: APIRoute = async () => {
  const db = createDb(env.saju_db)

  const result = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .limit(20)

  return Response.json(result)
}