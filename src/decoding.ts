import {
  ObfuscatedFlag,
  Flag,
  ObfuscatedVariation,
  VariationType,
  Variation,
  ObfuscatedAllocation,
  Allocation,
  Split,
  Shard,
  ObfuscatedSplit,
} from './interfaces';
import { decodeBase64 } from './obfuscation';

export function decodeFlag(flag: ObfuscatedFlag): Flag {
  return {
    ...flag,
    variations: decodeVariations(flag.variations, flag.variationType),
    allocations: flag.allocations.map(decodeAllocation),
  };
}

export function decodeVariations(
  variations: Record<string, ObfuscatedVariation>,
  variationType: VariationType,
): Record<string, Variation> {
  return Object.fromEntries(
    Object.entries(variations).map(([_, variation]) => {
      const decodedKey = decodeBase64(variation.key);
      return [
        decodedKey,
        { key: decodedKey, value: decodeValue(variation.value as string, variationType) },
      ];
    }),
  );
}

export function decodeValue(encodedValue: string, type: VariationType): string | number | boolean {
  switch (type) {
    case VariationType.INTEGER:
    case VariationType.NUMERIC:
      return Number(decodeBase64(encodedValue));
    case VariationType.BOOLEAN:
      return decodeBase64(encodedValue) === 'true';
    default:
      return decodeBase64(encodedValue);
  }
}

export function decodeAllocation(allocation: ObfuscatedAllocation): Allocation {
  return {
    ...allocation,
    key: decodeBase64(allocation.key),
    splits: allocation.splits.map(decodeSplit),
    startAt: allocation.startAt
      ? new Date(decodeBase64(allocation.startAt)).toISOString()
      : undefined,
    endAt: allocation.endAt ? new Date(decodeBase64(allocation.endAt)).toISOString() : undefined,
  };
}

export function decodeSplit(split: ObfuscatedSplit): Split {
  return {
    extraLogging: split.extraLogging ? JSON.parse(decodeBase64(split.extraLogging)) : undefined,
    variationKey: decodeBase64(split.variationKey),
    shards: split.shards.map(decodeShard),
  };
}

export function decodeShard(shard: Shard): Shard {
  return {
    ...shard,
    salt: decodeBase64(shard.salt),
  };
}
