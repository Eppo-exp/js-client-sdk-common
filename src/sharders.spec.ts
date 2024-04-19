import { MD5Sharder, DeterministicSharder } from './sharders';

describe('Sharders', () => {
  describe('MD5Sharder', () => {
    it('should correctly calculate shard for given input and total shards', () => {
      const sharder = new MD5Sharder();
      const inputs: [string, number][] = [
        ['test-input', 5619],
        ['alice', 3170],
        ['bob', 7420],
        ['charlie', 7497],
      ];
      const totalShards = 10000;
      inputs.forEach(([input, expectedShard]) => {
        expect(sharder.getShard(input, totalShards)).toEqual(expectedShard);
      });
    });
  });

  describe('DeterministicSharder', () => {
    it('should return the shard from the lookup table if present', () => {
      const lookup = { 'test-input': 5 };
      const sharder = new DeterministicSharder(lookup);
      const input = 'test-input';
      const totalShards = 10; // totalShards is ignored in DeterministicSharder
      expect(sharder.getShard(input, totalShards)).toEqual(5);
    });

    it('should return 0 if the input is not present in the lookup table', () => {
      const lookup = { 'some-other-input': 7 };
      const sharder = new DeterministicSharder(lookup);
      const input = 'test-input-not-in-lookup';
      const totalShards = 10; // totalShards is ignored in DeterministicSharder
      expect(sharder.getShard(input, totalShards)).toEqual(0);
    });
  });
});
