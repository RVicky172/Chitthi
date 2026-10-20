import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from 'mediabunny';

/*
 * A recorded take's length (209 §6, R1). MediaRecorder's WebM has no duration header (`<audio>` reads Infinity), and
 * Mediabunny's `computeDuration()` gives each packet the gap to the next, so the last packet counts as 0 s: one packet
 * (20–60 ms) short (209 T001). The length is read from the packets instead, without decoding the sound.
 */

/** A packet's place in the file, s. */
export interface PacketTime {
  timestamp: number;
  duration: number;
}

/**
 * Where the last packet ends: a last packet without a duration lasts as long as the one before it.
 * @param packets the packets in file order
 * @returns seconds (0 for none)
 */
export function lengthFromPackets(packets: Iterable<PacketTime>): number {
  let last: PacketTime | null = null;
  let step = 0;
  for (const packet of packets) {
    if (packet.duration > 0) step = packet.duration;
    last = packet;
  }
  if (!last) return 0;
  return last.timestamp + (last.duration > 0 ? last.duration : step);
}

/**
 * A recorded take's length; reading it also proves the file can be read.
 * @param blob the take
 * @returns seconds; rejects when it has no readable sound
 */
export async function measureTake(blob: Blob): Promise<number> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error('The recording has no sound in it.');
  const packets: PacketTime[] = [];
  for await (const packet of new EncodedPacketSink(track).packets()) packets.push({ timestamp: packet.timestamp, duration: packet.duration });
  const length = lengthFromPackets(packets);
  if (!Number.isFinite(length) || length <= 0) throw new Error('The recording is empty.');
  return length;
}
