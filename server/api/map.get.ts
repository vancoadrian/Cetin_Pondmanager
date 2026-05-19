import { defineEventHandler } from 'h3'
import type { MapStateResponse } from '~/services/mapApiService'
import { readLocalMapState } from '../utils/localMapStore'

export default defineEventHandler(async (): Promise<MapStateResponse> => {
  const state = await readLocalMapState()

  return {
    ok: true,
    mapLayers: state.mapLayers,
    mapShapes: state.mapShapes,
    pegs: state.pegs,
    updatedAt: state.updatedAt,
  }
})
