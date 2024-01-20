export interface CallbackData {
  A_PACK?: string; // Accept buy package - value is user package id
  R_PACK?: string; // Reject buy package - value is user package id
  A_CHARGE?: string; // Accept recharge account - value is payment id
  R_CHARGE?: string; // Reject recharge account - value is payment id
}

export const HOME_SCENE_ID = 'HOME_SCENE_ID';
export const REGISTER_SCENE_ID = 'REGISTER_SCENE_ID';
