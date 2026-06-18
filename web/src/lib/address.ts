export type Address = {
  id: string;
  recipient: string;
  phone: string;
  postcode: string | null;
  address: string | null;
  detail: string | null;
  memo: string | null;
  is_default: boolean;
};

export const ADDRESS_COLUMNS =
  "id, recipient, phone, postcode, address, detail, memo, is_default";
