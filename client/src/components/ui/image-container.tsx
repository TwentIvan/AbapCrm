import { useState } from "react";
import { cn } from "@/lib/utils";
import { ImageIcon, Building, User } from "lucide-react";

interface ImageContainerProps {
  src?: string | null;
  alt: string;
  fallbackType?: 'logo' | 'avatar' | 'generic';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  className?: string;
  containerClassName?: string;
  rounded?: boolean;
  onClick?: () => void;
  'data-testid'?: string;
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-12 h-12", 
  lg: "w-16 h-16",
  xl: "w-24 h-24",
  custom: ""
};

const fallbackIcons = {
  logo: Building,
  avatar: User,
  generic: ImageIcon
};

export default function ImageContainer({
  src,
  alt,
  fallbackType = 'generic',
  size = 'md',
  className,
  containerClassName,
  rounded = false,
  onClick,
  'data-testid': testId
}: ImageContainerProps) {
  const [hasError, setHasError] = useState(false);

  const FallbackIcon = fallbackIcons[fallbackType];
  
  const containerClasses = cn(
    "relative overflow-hidden bg-secondary flex items-center justify-center",
    size !== 'custom' && sizeClasses[size],
    rounded ? "rounded-full" : "rounded-lg",
    onClick && "cursor-pointer hover:opacity-80 transition-opacity",
    containerClassName
  );

  const imageClasses = cn(
    "w-full h-full object-cover",
    className
  );

  // Se non c'è src o c'è errore, mostra fallback
  if (!src || hasError) {
    return (
      <div className={containerClasses} onClick={onClick} data-testid={testId}>
        <FallbackIcon className="w-1/2 h-1/2 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={containerClasses} onClick={onClick} data-testid={testId}>
      <img
        src={src}
        alt={alt}
        className={imageClasses}
        draggable={false}
        onError={() => setHasError(true)}
      />
    </div>
  );
}
