import { useState, useEffect } from "react";
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
  custom: "" // Usa className per dimensioni personalizzate
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
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setImageState('error');
      return;
    }

    setImageState('loading');
    setImageSrc(null);

    const img = new Image();
    img.onload = () => {
      setImageSrc(src);
      setImageState('loaded');
    };
    img.onerror = () => {
      setImageState('error');
    };
    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  const FallbackIcon = fallbackIcons[fallbackType];
  
  const containerClasses = cn(
    "relative overflow-hidden bg-secondary flex items-center justify-center",
    size !== 'custom' && sizeClasses[size],
    rounded ? "rounded-full" : "rounded-lg",
    onClick && "cursor-pointer hover:opacity-80 transition-opacity",
    containerClassName
  );

  const imageClasses = cn(
    "w-full h-full object-cover transition-opacity duration-200",
    imageState === 'loaded' ? "opacity-100" : "opacity-0",
    className
  );

  return (
    <div 
      className={containerClasses} 
      onClick={onClick}
      data-testid={testId}
    >
      {/* Actual Image */}
      {imageSrc && (
        <img
          src={imageSrc}
          alt={alt}
          className={imageClasses}
          draggable={false}
        />
      )}
      
      {/* Loading/Error Fallback */}
      <div 
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-opacity duration-200",
          imageState === 'loaded' ? "opacity-0" : "opacity-100"
        )}
      >
        {imageState === 'loading' ? (
          <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
        ) : (
          <FallbackIcon className="w-1/2 h-1/2 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}