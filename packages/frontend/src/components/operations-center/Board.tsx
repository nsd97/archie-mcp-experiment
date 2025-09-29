/**
 * Generic drag-and-drop Board component.
 *
 * Renders columns with draggable cards using @hello-pangea/dnd.
 * The parent component supplies column IDs, items grouped by column, and an
 * `onDrop` callback to perform mutations.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import type { ReactNode } from "react";

export type BoardColumn = {
  id: string;
  title: string;
  headerRight?: ReactNode;
};

export interface BoardProps<T> {
  columns: BoardColumn[];
  itemsByColumn: Record<string, T[]>;
  getId: (t: T) => string;
  renderCard: (t: T) => React.ReactNode;
  /**
   * Called after a drag finishes with the source/destination info.
   */
  onDrop: (
    draggableId: string,
    sourceColumnId: string,
    destColumnId: string,
    sourceIndex: number,
    destIndex: number
  ) => void;
}

/**
 * Presentational DnD board. No internal state; it delegates reordering/mutations
 * to the parent via `onDrop`.
 */
export function Board<T>({ columns, itemsByColumn, getId, renderCard, onDrop }: BoardProps<T>) {
  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return; // dropped outside
    // No-op if item was dropped back to its original position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }
    onDrop(
      draggableId,
      source.droppableId,
      destination.droppableId,
      source.index,
      destination.index
    );
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((col) => (
          <Card className="flex-1" key={col.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{col.title}</CardTitle>
                {col.headerRight}
              </div>
            </CardHeader>
            <CardContent>
              <Droppable droppableId={col.id}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    <ScrollArea className="h-[60vh] pr-2">
                      <div className="space-y-2">
                        {(itemsByColumn[col.id] || []).map((item, index) => (
                          <Draggable draggableId={getId(item)} index={index} key={getId(item)}>
                            {(drag) => (
                              <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps}>
                                {renderCard(item)}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </Droppable>
            </CardContent>
          </Card>
        ))}
      </div>
    </DragDropContext>
  );
}

export default Board;


