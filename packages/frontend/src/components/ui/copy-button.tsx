import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface CopyButtonProps {
  value: any;
  fieldName?: string;
  format?: 'raw' | 'formatted' | 'currency' | 'boolean' | 'array' | 'phone' | 'postal';
  size?: 'micro' | 'sm' | 'default';
  variant?: 'ghost' | 'outline' | 'default';
  className?: string;
  showLabel?: boolean;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  fieldName,
  format = 'raw',
  size = 'micro',
  variant = 'ghost',
  className,
  showLabel = false
}) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const formatValue = (val: any, fmt: string): string => {
    if (val === null || val === undefined) return '';

    switch (fmt) {
      case 'currency':
        return typeof val === 'number' ? `$${val.toLocaleString()}` : val.toString();
      
      case 'boolean':
        return typeof val === 'boolean' ? (val ? 'Yes' : 'No') : val.toString();
      
      case 'array':
        return Array.isArray(val) ? val.join(', ') : val.toString();
      
      case 'phone':
        return val.toString().replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
      
      case 'postal':
        return val.toString().toUpperCase().replace(/(\w{3})(\w{3})/, '$1 $2');
      
      case 'formatted':
        if (typeof val === 'number') {
          return val.toLocaleString();
        }
        return val.toString();
      
      case 'raw':
      default:
        return val.toString();
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const textToCopy = formatValue(value, format);
      await navigator.clipboard.writeText(textToCopy);
      
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      toast({
        description: `Copied ${fieldName || 'value'}`,
        duration: 1500,
      });
    } catch (err) {
      console.error('Failed to copy:', err);
      toast({
        description: 'Failed to copy',
        variant: 'destructive',
        duration: 1500,
      });
    }
  };

  const iconSize = size === 'micro' ? 'h-3 w-3' : size === 'sm' ? 'h-4 w-4' : 'h-4 w-4';
  const buttonSize = size === 'micro' ? 'h-5 w-5' : size === 'sm' ? 'h-7 w-7' : 'sm';

  return (
    <Button
      size={size === 'micro' || size === 'sm' ? 'sm' : 'default'}
      variant={variant}
      onClick={handleCopy}
      className={cn(
        'transition-all duration-200 hover:scale-105',
        size === 'micro' && 'h-5 w-5 p-0 rounded-sm',
        size === 'sm' && 'h-7 w-7 p-1',
        showLabel ? 'gap-2' : '',
        className
      )}
      disabled={!value}
    >
      {copied ? (
        <Check className={cn(iconSize, 'text-primary')} />
      ) : (
        <Copy className={iconSize} />
      )}
      {showLabel && (copied ? 'Copied!' : 'Copy')}
    </Button>
  );
};