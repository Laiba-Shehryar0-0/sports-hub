import cricketImg from '../assets/cricket.jfif';
import footballImg from '../assets/football.jpg';
import basketballImg from '../assets/basketball.jfif';
import trainingImg from '../assets/training.jfif';

export const FEATURED_KITS_SEED = [
  {
    id: 1,
    image: cricketImg,
    emoji: '🏏',
    tag: 'Featured',
    sport: 'cricket',
    title: 'Cricket Kit',
    desc: 'Premium uniform with professional cut and breathable fabric.',
    color: '#8B6914',
    accent: '#F5A623',
    tagBg: '#3d3000',
    hoverRgb: '138, 112, 0',
  },
  {
    id: 2,
    image: footballImg,
    emoji: '⚽',
    tag: 'Featured',
    sport: 'football',
    title: 'Football Kit',
    desc: 'Professional football jersey with moisture-wicking technology.',
    color: '#1a4a1a',
    accent: '#4CAF50',
    tagBg: '#0a2a0a',
    hoverRgb: '26, 92, 26',
  },
  {
    id: 3,
    image: basketballImg,
    emoji: '🏀',
    tag: 'Featured',
    sport: 'basketball',
    title: 'Basketball Kit',
    desc: 'High-performance basketball uniform with enhanced mobility.',
    color: '#1a2a4a',
    accent: '#2196F3',
    tagBg: '#040f30',
    hoverRgb: '10, 42, 106',
  },
  {
    id: 4,
    image: trainingImg,
    emoji: '💪',
    tag: 'Featured',
    sport: 'training',
    title: 'Training Kit',
    desc: 'Comfortable training wear perfect for practice sessions.',
    color: '#2a1a2a',
    accent: '#9C27B0',
    tagBg: '#20003a',
    hoverRgb: '74, 10, 106',
  },
];
