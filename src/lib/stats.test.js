import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getLocalDateStr,
  parseLocalDate,
  getDayName,
  sumPagesForDate,
  buildChartData,
  getLast7Total,
  getStreak,
  getLastReadInfo,
  getInitials
} from './stats'

// Les fonctions de ce module dépendent toutes de « aujourd'hui ». On fige donc
// l'horloge, sinon les tests deviennent instables au passage de minuit.
const FIXED_NOW = new Date(2026, 6, 20, 12, 0, 0) // 20 juillet 2026, midi local

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

const log = (date, pages, bookId = 'book-1') => ({
  date,
  pages_read: pages,
  book_id: bookId
})

describe('getLocalDateStr', () => {
  it('renvoie la date locale du jour', () => {
    expect(getLocalDateStr()).toBe('2026-07-20')
  })

  it('recule du nombre de jours demandé', () => {
    expect(getLocalDateStr(1)).toBe('2026-07-19')
    expect(getLocalDateStr(20)).toBe('2026-06-30')
  })
})

describe('parseLocalDate', () => {
  // C'est le cœur de §2.8 : `new Date('2026-07-20')` donne minuit UTC, dont le
  // getDay() local est décalé d'un jour dans tous les fuseaux négatifs.
  it('parse en minuit LOCAL, pas UTC', () => {
    const d = parseLocalDate('2026-07-20')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(0)
  })

  it('donne le même jour de semaine que la date calendaire', () => {
    // 20 juillet 2026 est un lundi.
    expect(getDayName('2026-07-20')).toBe('الاثنين')
  })
})

describe('sumPagesForDate', () => {
  // §2.2 : daily_logs a une ligne par livre ET par jour. `.find()` n'en
  // retournait qu'une, ignorant silencieusement les autres.
  it('somme toutes les lignes d\'une même date, tous livres confondus', () => {
    const logs = [
      log('2026-07-20', 10, 'book-1'),
      log('2026-07-20', 25, 'book-2'),
      log('2026-07-19', 100, 'book-1')
    ]
    expect(sumPagesForDate(logs, '2026-07-20')).toBe(35)
  })

  it('renvoie 0 pour une date sans lecture', () => {
    expect(sumPagesForDate([log('2026-07-19', 10)], '2026-07-20')).toBe(0)
  })

  it('tolère une liste absente ou vide', () => {
    expect(sumPagesForDate(null, '2026-07-20')).toBe(0)
    expect(sumPagesForDate([], '2026-07-20')).toBe(0)
  })

  it('tolère un pages_read manquant', () => {
    expect(sumPagesForDate([{ date: '2026-07-20' }], '2026-07-20')).toBe(0)
  })
})

describe('buildChartData', () => {
  it('produit une entrée par jour, la plus ancienne en premier', () => {
    const data = buildChartData([], 7)
    expect(data).toHaveLength(7)
    expect(data[0].date).toBe('2026-07-14')
    expect(data[6].date).toBe('2026-07-20')
  })

  it('agrège plusieurs livres sur la même journée', () => {
    const logs = [log('2026-07-20', 10, 'book-1'), log('2026-07-20', 5, 'book-2')]
    const data = buildChartData(logs, 7)
    expect(data.at(-1).pages).toBe(15)
  })

  it('accepte le range en chaîne comme en nombre', () => {
    expect(buildChartData([], '30')).toHaveLength(30)
    expect(buildChartData([], 30)).toHaveLength(30)
  })

  it('range "all" part de la plus ancienne lecture', () => {
    const data = buildChartData([log('2026-07-18', 5)], 'all')
    expect(data).toHaveLength(3) // 18, 19, 20
    expect(data[0].date).toBe('2026-07-18')
  })

  it('range "all" sans aucun log renvoie une liste vide', () => {
    expect(buildChartData([], 'all')).toEqual([])
  })
})

describe('getLast7Total', () => {
  it('additionne les 7 derniers jours, aujourd\'hui inclus', () => {
    const logs = [
      log('2026-07-20', 10),
      log('2026-07-14', 5),
      log('2026-07-13', 999) // hors fenêtre
    ]
    expect(getLast7Total(logs)).toBe(15)
  })
})

describe('getStreak', () => {
  it('compte les jours consécutifs en remontant depuis aujourd\'hui', () => {
    const logs = [log('2026-07-20', 5), log('2026-07-19', 3), log('2026-07-18', 1)]
    expect(getStreak(logs)).toBe(3)
  })

  it('vaut 0 si rien n\'a été lu aujourd\'hui', () => {
    expect(getStreak([log('2026-07-19', 10)])).toBe(0)
  })

  it('s\'arrête au premier jour manquant', () => {
    const logs = [log('2026-07-20', 5), log('2026-07-18', 5)]
    expect(getStreak(logs)).toBe(1)
  })
})

describe('getLastReadInfo', () => {
  // §6.5 : « jamais commencé » ne doit pas être confondu avec « absent ».
  it('distingue un lecteur qui n\'a jamais lu', () => {
    expect(getLastReadInfo([])).toEqual({ lastDate: null, daysSince: Infinity, neverRead: true })
  })

  it('ignore les journées à zéro page', () => {
    expect(getLastReadInfo([log('2026-07-20', 0)]).neverRead).toBe(true)
  })

  it('calcule l\'ancienneté depuis la dernière lecture', () => {
    const info = getLastReadInfo([log('2026-07-18', 4), log('2026-07-10', 2)])
    expect(info.lastDate).toBe('2026-07-18')
    expect(info.daysSince).toBe(2)
    expect(info.neverRead).toBe(false)
  })

  it('renvoie 0 jour pour une lecture du jour même', () => {
    expect(getLastReadInfo([log('2026-07-20', 1)]).daysSince).toBe(0)
  })
})

describe('getInitials', () => {
  it('prend la première lettre de deux mots', () => {
    expect(getInitials('محمد الهامي')).toBe('ما')
  })

  it('se limite à deux caractères', () => {
    expect(getInitials('أحمد بن علي الشريف').length).toBeLessThanOrEqual(2)
  })

  it('a une valeur de repli sur un nom absent', () => {
    expect(getInitials('')).toBe('م')
    expect(getInitials(null)).toBe('م')
  })
})
