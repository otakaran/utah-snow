import { describe, expect, it } from 'vitest';
import { roadHintState } from './road-hint.ts';

describe('roadHintState', () => {
  it('reads Alta road-status values', () => {
    expect(roadHintState('4x4 or Chains Req')).toBe('traction');
    expect(roadHintState('Closed: avalanche control')).toBe('closed');
    expect(roadHintState('Interlodge in effect')).toBe('interlodge');
    expect(roadHintState('Open')).toBe('open');
    expect(roadHintState('See UDOT')).toBe('unknown');
  });

  it('reads Brighton road comments', () => {
    expect(roadHintState('SR-190 is open with no traction restrictions.')).toBe('open');
    expect(roadHintState('Traction law in effect: 4WD/AWD required')).toBe('traction');
    expect(roadHintState('SR-190 is closed for avalanche control')).toBe('closed');
    expect(roadHintState('Check conditions before you go')).toBe('unknown');
  });

  it('never reads a future closure or a lifted restriction as closed, interlodge or traction', () => {
    expect(roadHintState('SR-210 will close at 5 pm for avalanche control')).toBe('unknown');
    expect(roadHintState('Interlodge has been lifted')).toBe('open');
    expect(roadHintState('The traction law has been lifted')).toBe('open');
    expect(roadHintState('Road closure lifted at 9:15')).toBe('open');
  });
});
