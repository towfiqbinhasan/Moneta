import {
  Baby, Banknote, Bike, Book, Briefcase, Bus, Car, CircleEllipsis, Coffee, CreditCard, Dog, Download,
  Dumbbell, Film, Fuel, Gamepad2, Gift, GraduationCap, HandHeart, Heart, HeartPulse, Home, Landmark,
  Laptop, Music, PartyPopper, Percent, PiggyBank, Pill, Plane, Receipt, Send, Shirt, ShoppingBag,
  ShoppingBasket, Smartphone, Sparkles, Store, Target, Train, Trophy, Umbrella, Users, Utensils,
  Wallet, Wifi, Wrench, Zap, Cake, Car as Taxi, Palmtree, Building2, Wine, Scissors, Stethoscope,
  type LucideIcon, type LucideProps,
} from 'lucide-react';

/**
 * Curated icon registry. Icons are stored by name in the DB so they survive
 * export/sync; only these are bundled (tree-shaken).
 */
export const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, coffee: Coffee, 'shopping-basket': ShoppingBasket, bus: Bus, car: Car, taxi: Taxi,
  train: Train, plane: Plane, bike: Bike, fuel: Fuel, home: Home, building: Building2, zap: Zap, wifi: Wifi,
  smartphone: Smartphone, 'graduation-cap': GraduationCap, book: Book, 'heart-pulse': HeartPulse,
  pill: Pill, stethoscope: Stethoscope, 'shopping-bag': ShoppingBag, shirt: Shirt, film: Film,
  music: Music, gamepad: Gamepad2, gift: Gift, cake: Cake, 'party-popper': PartyPopper, 'hand-heart': HandHeart,
  heart: Heart, 'piggy-bank': PiggyBank, target: Target, trophy: Trophy, umbrella: Umbrella,
  palmtree: Palmtree, baby: Baby, dog: Dog, users: Users, dumbbell: Dumbbell, wrench: Wrench,
  scissors: Scissors, wine: Wine, receipt: Receipt, percent: Percent, briefcase: Briefcase, store: Store,
  laptop: Laptop, send: Send, download: Download, wallet: Wallet, banknote: Banknote, landmark: Landmark,
  'credit-card': CreditCard, sparkles: Sparkles, 'circle-ellipsis': CircleEllipsis,
};

export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const C = ICONS[name] ?? CircleEllipsis;
  return <C {...props} />;
}
