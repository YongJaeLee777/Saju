import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'

import { createDb } from '../../../db/client'
import { sajuProfiles } from '../../../db/schema'

export const prerender = false

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json()

    if (
      typeof body !== 'object' || body === null || Array.isArray(body) ||
      !('birthDate' in body) || !('gender' in body) || !('calendarType' in body)
    ) {
      return Response.json({ message: '입력 데이터를 확인해주세요.' }, { status: 400 })
    }

    const { birthDate, gender, calendarType } = body
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

    const profileId = crypto.randomUUID()

    const now = new Date()

    const db = createDb(env.saju_db)

    await db.insert(sajuProfiles).values({
      id: profileId,

      // 아직 비회원
      userId: null,

      birthDate,
      birthTime: birthTime || null,
      gender,
      calendarType,
      isLeapMonth,

      createdAt: now,
      updatedAt: now,
    })

    return Response.json({
      profileId,
    })
  } catch (error) {
    console.error(error)

    return Response.json(
      {
        message: '사주 정보를 저장하지 못했습니다.',
      },
      {
        status: 500,
      },
    )
  }
}
