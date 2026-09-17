function indexSuggestion(error) {
 const encoded = error.message?.match(/create_composite=([A-Za-z0-9_-]+)/)?.[1];
 if (!encoded) return null;
 const parse = buffer => {
  let offset = 0; const fields = [];
  const varint = () => { let value = 0, shift = 0, byte; do {byte = buffer[offset++]; value += (byte & 127) * 2 ** shift; shift += 7;} while(byte & 128); return value; };
  while(offset < buffer.length) { const tag = varint(), wire = tag & 7, field = tag >> 3; if(wire === 0) fields.push([field,varint()]); else if(wire === 2) {const size = varint(); fields.push([field,buffer.subarray(offset,offset + size)]);offset += size;} else throw Error('Unsupported index encoding'); }
  return fields;
 };
 const fields = parse(Buffer.from(encoded, 'base64url'));
 const name = fields.find(([field]) => field === 1)?.[1].toString();
 const collectionGroup = name?.match(/collectionGroups\/([^/]+)\/indexes/)?.[1];
 if (!collectionGroup) return null;
 return { collectionGroup, queryScope: 'COLLECTION', fields: fields.filter(([field]) => field === 3).map(([, value]) => {
  const values = parse(value), fieldPath = values.find(([field]) => field === 1)?.[1].toString();
  return values.some(([field]) => field === 3) ? { fieldPath, arrayConfig: 'CONTAINS' } : { fieldPath, order: values.find(([field]) => field === 2)?.[1] === 2 ? 'DESCENDING' : 'ASCENDING' };
 }).filter(field => field.fieldPath !== '__name__') };
}
module.exports = { indexSuggestion };
