import { getPaymentIdentity } from '../../../lib/payments/server/payment-config'
import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'

import { createDb } from '../../../db/client'
import { normalizeDisplayName } from '../../../lib/saju/display-name'
import { sajuProfiles } from '../../../db/schema'
import { prepareAnonymousBuyerRateLimit } from '../../../lib/payments/server/report-access'

export const prerender = false
const headers = { 'Cache-Control': 'private, no-store' }
type RouteContext = {
  request: Request
  cookies: Parameters<typeof prepareAnonymousBuyerRateLimit>[0]['cookies']
}

export const POST = (async ({ request, cookies }: RouteContext): Promise<Response> => {
  try {
    const body = await request.json()

    if (
      typeof body !== 'object' || body === null || Array.isArray(body) ||
      !('birthDate' in body) || !('gender' in body) || !('calendarType' in body)
    ) {
      return Response.json({ message: '입력 데이터를 확인해주세요.' }, { status: 400 })
    }

    const { birthDate, gender, calendarType } = body
    const displayName = normalizeDisplayName('displayName' in body ? body.displayName : undefined)
    if (displayName === undefined) {
      return Response.json({ message: '이름은 30자 이내의 이름 또는 닉네임으로 입력해주세요.' }, { status: 400, headers })
    }
    const birthTime = 'birthTime' in body ? body.birthTime : null
    const isLeapMonth = 'isLeapMonth' in body ? body.isLeapMonth : false

    if (typeof birthDate !== 'string' || !birthDate) {
      return Response.json(
        {
          message: '생년월일을 입력해주세요.',
        },
        {
          status: 400,
        },
      )
    }

    if (
      gender !== 'male' &&
      gender !== 'female'
    ) {
      return Response.json(
        {
          message: '성별을 확인해주세요.',
        },
        {
          status: 400,
        },
      )
    }

    if (
      calendarType !== 'solar' &&
      calendarType !== 'lunar'
    ) {
      return Response.json(
        {
          message: '양력/음력을 확인해주세요.',
        },
        {
          status: 400,
        },
      )
    }

    if (
      (birthTime !== null && typeof birthTime !== 'string') ||
      typeof isLeapMonth !== 'boolean'
    ) {
      return Response.json({ message: '출생시간과 윤달 값을 확인해주세요.' }, { status: 400 })
    }

    const config = getPaymentIdentity()
    if (!config) return Response.json({ message: 'Configuration error' }, { status: 500, headers })
    const identity = await prepareAnonymousBuyerRateLimit({ cookies, environment: config.environment })
    if (!(await env.PROFILE_RATE_LIMIT.limit({ key: identity.key })).success) {
      return Response.json({ message: '요청이 너무 많습니다.' }, { status: 429, headers })
    }
    const db = createDb(env.saju_db)
    await identity.issueBuyer?.(db)

    const profileId = crypto.randomUUID()

    const now = new Date()

    await db.insert(sajuProfiles).values({
      id: profileId,

      // 아직 비회원
      userId: null,

      birthDate,
      displayName,
      birthTime: birthTime || null,
      gender,
      calendarType,
      isLeapMonth,

      createdAt: now,
      updatedAt: now,
    })

    return Response.json({
      profileId,
      displayName,
    }, { headers })
  } catch {

    return Response.json(
      {
        message: '사주 정보를 저장하지 못했습니다.',
      },
      {
        status: 500,
        headers,
      },
    )
  }
}) satisfies APIRoute
