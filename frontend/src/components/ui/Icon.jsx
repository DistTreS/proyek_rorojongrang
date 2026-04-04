import * as Lucide from 'lucide-react';

const Icon = ({ name, size = 20, className = '', ...props }) => {
  const LucideIcon = Lucide[name];
  if (!LucideIcon) return null;
  return <LucideIcon size={size} className={className} {...props} />;
};

export default Icon;