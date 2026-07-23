/**
 * Node: "Encode image to base64"
 * Mode: Run Once for Each Item
 *
 * Converts the Telegram photo download into the base64 payload the
 * Claude vision API expects.
 *
 * Note: `this.helpers`, not `$helpers`.
 */

const buffer = await this.helpers.getBinaryDataBuffer($itemIndex, 'data');

return {
  json: {
    image_base64: buffer.toString('base64'),
    mime_type: $input.item.binary.data.mimeType || 'image/jpeg',
  },
};
