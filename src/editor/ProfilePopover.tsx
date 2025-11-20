import React, { useState, useCallback } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { stopEventPropagation } from 'tldraw';
import type { ArenaUser } from '../arena/types';
import { COMPONENT_STYLES } from '../arena/constants';
import { getTactileScales } from '../arena/constants';
import { Profile3DCard } from './Profile3DCard';

interface ProfilePopoverProps {
  userInfo: ArenaUser | null;
  onLogout: () => void;
}

/**
 * Profile Popover Component
 * 
 * Displays user profile in a popover with:
 * - 3D interactive avatar card (top half)
 * - User metadata (channels, followers, following)
 * - Logout action (bottom)
 */
export const ProfilePopover: React.FC<ProfilePopoverProps> = ({
  userInfo,
  onLogout,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = useCallback(() => {
    onLogout();
    setIsOpen(false);
  }, [onLogout]);

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button
          aria-label="Profile"
          data-tactile
          style={{
            ...COMPONENT_STYLES.buttons.iconButton,
            ...getTactileScales('action'),
          }}
          onPointerDown={(e) => stopEventPropagation(e)}
          onPointerUp={(e) => stopEventPropagation(e)}
          onWheel={(e) => {
            if ((e as any).ctrlKey) {
              ;(e as any).preventDefault();
            } else {
              ;(e as any).stopPropagation();
            }
          }}
        >
          {userInfo?.full_name?.[0] || userInfo?.username?.[0] || '•'}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={12}
          avoidCollisions={true}
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{
            ...COMPONENT_STYLES.overlays.profilePopover,
            width: '240px',
            maxHeight: '420px',
            padding: '0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: '12px',
          }}
          onPointerDown={(e) => stopEventPropagation(e)}
          onPointerUp={(e) => stopEventPropagation(e)}
          onWheel={(e) => {
            if ((e as any).ctrlKey) {
              ;(e as any).preventDefault();
            } else {
              ;(e as any).stopPropagation();
            }
          }}
        >
          {/* 3D Avatar Card - Top Half */}
          <div
            style={{
              width: '240px',
              height: '200px',
              backgroundColor: 'rgba(245, 245, 245, 0.8)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <Profile3DCard avatar={userInfo?.avatar} size={96} />
          </div>

          {/* Metadata Section - Bottom Half */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              flex: 1,
              overflowY: 'auto',
            }}
          >
            {/* Full Name */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#333',
                }}
              >
                {userInfo?.full_name}
              </div>
            </div>

            {/* Stats Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px',
                paddingTop: '14px',
                borderTop: '1px solid rgba(0, 0, 0, 0.08)',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#333',
                  }}
                >
                  {userInfo?.channel_count ?? 0}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'rgba(0, 0, 0, 0.55)',
                    fontWeight: 500,
                    marginTop: '2px',
                  }}
                >
                  channels
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#333',
                  }}
                >
                  {userInfo?.follower_count ?? 0}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'rgba(0, 0, 0, 0.55)',
                    fontWeight: 500,
                    marginTop: '2px',
                  }}
                >
                  followers
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#333',
                  }}
                >
                  {userInfo?.following_count ?? 0}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'rgba(0, 0, 0, 0.55)',
                    fontWeight: 500,
                    marginTop: '2px',
                  }}
                >
                  following
                </div>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '8px 12px',
                marginTop: '4px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'rgba(0, 0, 0, 0.6)',
                backgroundColor: 'rgba(0, 0, 0, 0.04)',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.backgroundColor =
                  'rgba(0, 0, 0, 0.06)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.backgroundColor =
                  'rgba(0, 0, 0, 0.04)';
              }}
            >
              Log out
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

