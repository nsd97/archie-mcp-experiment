import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from './AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export const GoogleSignIn = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { signInWithGoogle } = useAuth();
  const { toast } = useToast();

  const handleSignIn = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
    } catch (error) {
      toast({
        title: "Sign in failed",
        description: error instanceof Error ? error.message : "Failed to sign in with Google",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="flex -space-x-0.5">
            <div className="w-3 h-3 bg-[hsl(207_100%_50%)] rounded-full"></div>
            <div className="w-3 h-3 bg-[hsl(4_100%_59%)] rounded-full"></div>
            <div className="w-3 h-3 bg-[hsl(45_100%_51%)] rounded-full"></div>
            <div className="w-3 h-3 bg-[hsl(134_71%_49%)] rounded-full"></div>
          </div>
        </div>
        <CardTitle className="text-xl">Connect Google Account</CardTitle>
        <CardDescription>
          Sign in to access your Google Forms, Sheets, and Drive files for seamless property data import.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={handleSignIn} 
          disabled={isLoading} 
          className="w-full"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mr-2">
                <div className="flex -space-x-0.5">
                  <div className="w-3 h-3 bg-[hsl(207_100%_50%)] rounded-full"></div>
                  <div className="w-3 h-3 bg-[hsl(4_100%_59%)] rounded-full"></div>
                  <div className="w-3 h-3 bg-[hsl(45_100%_51%)] rounded-full"></div>
                  <div className="w-3 h-3 bg-[hsl(134_71%_49%)] rounded-full"></div>
                </div>
              </div>
              Sign in with Google
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};