// Loaded only after paid snapshot authorization and atomic one-attempt claim.
import 'astro:env/server'
import { env } from 'cloudflare:workers'
import { createOpenAiJsonClient } from './openai-json-client'

export const openAiNarrativeClient = createOpenAiJsonClient(() => env.OPENAI_API_KEY)
