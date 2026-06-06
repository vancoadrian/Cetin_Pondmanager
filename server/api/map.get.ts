import { defineEventHandler } from 'h3'
import { filterPublicMapState, type MapStateResponse } from '~/services/mapApiService'
import { readLocalMapState } from '../utils/localMapStore'

export default defineEventHandler(async (): Promise<MapStateResponse> => {
  const state = await readLocalMapState()
  const publicState = filterPublicMapState({
    mapFacilities: state.mapFacilities,
    mapLayers: state.mapLayers,
    mapShapes: state.mapShapes,
    pegs: state.pegs,
  })

  return {
    ok: true,
    mapFacilities: publicState.mapFacilities,
    mapLayers: publicState.mapLayers,
    mapShapes: publicState.mapShapes,
    pegs: publicState.pegs,
    updatedAt: state.updatedAt,
  }
})
