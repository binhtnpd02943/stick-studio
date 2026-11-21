// Screenplay from design spec section 7.3, shared across packages' tests.
export const specExample = () => ({
  version: 1,
  format: { aspect: '9:16', fps: 30 },
  cast: [
    { id: 'minh', name: 'Minh', look: { ink: '#141414', hair: 'short' }, voice: 'male_young' },
    { id: 'lan', name: 'Lan', look: { ink: '#d97757', hair: 'ponytail' }, voice: 'female_young' },
  ],
  scenes: [
    {
      id: 's1',
      backdrop: 'classroom',
      props: [{ id: 'board', type: 'whiteboard', mark: 'right' }],
      start: { minh: 'left', lan: 'center' },
      beats: [
        {
          say: { who: 'minh', text: 'Lan ơi, phân số là gì vậy?' },
          do: [{ who: 'minh', action: 'think' }],
        },
        {
          do: [
            { who: 'lan', action: 'walk_to', target: 'board' },
            { who: 'lan', action: 'point_at', target: 'board' },
          ],
          say: { who: 'lan', text: 'Nhìn cái bánh pizza này nhé.' },
          camera: { zoom: 1.3, focus: 'board' },
        },
      ],
    },
  ],
})
