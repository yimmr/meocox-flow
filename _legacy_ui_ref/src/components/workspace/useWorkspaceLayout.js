import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_PANEL_WIDTH = 200;
const COLLAPSE_THRESHOLD = 90;

/** Owns the three-column workspace sizing and its global pointer listeners. */
export function useWorkspaceLayout() {
  const workspaceContainerRef = useRef(null);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(340);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const toggleLeftSidebar = useCallback(() => {
    setIsLeftSidebarOpen((previous) => {
      const next = !previous;
      if (next && leftWidth < MIN_PANEL_WIDTH) setLeftWidth(260);
      return next;
    });
  }, [leftWidth]);

  const toggleRightSidebar = useCallback(() => {
    setIsRightSidebarOpen((previous) => {
      const next = !previous;
      if (next && rightWidth < MIN_PANEL_WIDTH) setRightWidth(340);
      return next;
    });
  }, [rightWidth]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleLeftSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleLeftSidebar]);

  useEffect(() => {
    if (!isDraggingLeft && !isDraggingRight) return undefined;

    const handleMouseMove = (event) => {
      const container = workspaceContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const totalWidth = rect.width;

      if (isDraggingLeft) {
        const rawLeft = event.clientX - rect.left;
        if (rawLeft < COLLAPSE_THRESHOLD) {
          setIsLeftSidebarOpen(false);
          setIsDraggingLeft(false);
          return;
        }

        const currentRight = isRightSidebarOpen ? rightWidth : 0;
        const availableForMiddle = totalWidth - rawLeft - currentRight;
        if (availableForMiddle >= MIN_PANEL_WIDTH) {
          setLeftWidth(Math.round(rawLeft));
        } else if (isRightSidebarOpen) {
          const availableForRight = totalWidth - rawLeft - MIN_PANEL_WIDTH;
          if (availableForRight < COLLAPSE_THRESHOLD) {
            setIsRightSidebarOpen(false);
            setLeftWidth(Math.round(Math.min(rawLeft, totalWidth - MIN_PANEL_WIDTH)));
          } else {
            setRightWidth(Math.round(availableForRight));
            setLeftWidth(Math.round(rawLeft));
          }
        } else {
          setLeftWidth(Math.round(Math.min(rawLeft, totalWidth - MIN_PANEL_WIDTH)));
        }
        return;
      }

      const rawRight = rect.right - event.clientX;
      if (rawRight < COLLAPSE_THRESHOLD) {
        setIsRightSidebarOpen(false);
        setIsDraggingRight(false);
        return;
      }

      const currentLeft = isLeftSidebarOpen ? leftWidth : 0;
      const availableForMiddle = totalWidth - rawRight - currentLeft;
      if (availableForMiddle >= MIN_PANEL_WIDTH) {
        setRightWidth(Math.round(rawRight));
      } else if (isLeftSidebarOpen) {
        const availableForLeft = totalWidth - rawRight - MIN_PANEL_WIDTH;
        if (availableForLeft < COLLAPSE_THRESHOLD) {
          setIsLeftSidebarOpen(false);
          setRightWidth(Math.round(Math.min(rawRight, totalWidth - MIN_PANEL_WIDTH)));
        } else {
          setLeftWidth(Math.round(availableForLeft));
          setRightWidth(Math.round(rawRight));
        }
      } else {
        setRightWidth(Math.round(Math.min(rawRight, totalWidth - MIN_PANEL_WIDTH)));
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
      setLeftWidth((width) => Math.max(width, MIN_PANEL_WIDTH));
      setRightWidth((width) => Math.max(width, MIN_PANEL_WIDTH));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDraggingLeft, isDraggingRight, isLeftSidebarOpen, isRightSidebarOpen, leftWidth, rightWidth]);

  return {
    workspaceContainerRef,
    isLeftSidebarOpen,
    isRightSidebarOpen,
    leftWidth,
    rightWidth,
    isDraggingLeft,
    isDraggingRight,
    setLeftWidth,
    setIsRightSidebarOpen,
    setIsDraggingLeft,
    setIsDraggingRight,
    toggleLeftSidebar,
    toggleRightSidebar
  };
}
