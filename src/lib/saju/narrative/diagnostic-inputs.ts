/** The five calculated charts used by the existing narrative diagnostic. */
export const NARRATIVE_DIAGNOSTIC_DATE = new Date('2026-09-13T00:00:00+09:00')
export const NARRATIVE_DIAGNOSTIC_INPUTS = [
  { birthDate: '1988-09-13', birthTime: '13:04', gender: 'female' },
  { birthDate: '1973-01-24', birthTime: '13:04', gender: 'female' },
  { birthDate: '1992-02-13', birthTime: '21:30', gender: 'male' },
  { birthDate: '1973-11-13', birthTime: '13:04', gender: 'female' },
  { birthDate: '1984-01-24', birthTime: '13:04', gender: 'female' },
] as const
